import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { before, after, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../lib/db/schema.ts';
import { verifyEmailWorkerAuth } from '../lib/auth/email-worker.ts';

process.env.DATABASE_URL = 'postgres://queue_test:queue_test@127.0.0.1:1/queue_test';
process.env.EMAIL_WORKER_SECRET = 'b'.repeat(64);
process.env.ANTHROPIC_API_KEY = 'synthetic-queue-ai-key';
process.env.POSTMARK_WEBHOOK_USER = 'synthetic-inbound';
process.env.POSTMARK_WEBHOOK_PASSWORD = 'synthetic-password';
let database, embedded, queue, worker, processing, mutations, loadInbox, loadDetails, webhook, endpoint;
let aiStatus = 200, decision = 'sim', providerCalls = 0;
const { emails, tenants, faturasDraft, emailProcessingJobs: jobs } = schema;
const triagem = { is_fatura_request: 'sim', motivo: 'Pedido fictício', confianca: 'alta' };
const dados = { cliente_nome: 'Cliente fictício', items: [{ descricao: 'Serviço', quantidade: 1, preco_unitario: 10, iva_percentagem: 23 }],
  confianca_extracao: 'alta', notas_extracao: '' };

before(async () => {
  database = new PGlite(); embedded = drizzle(database, { schema });
  const directory = new URL('../drizzle/', import.meta.url);
  for (const file of (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) await database.exec(await readFile(new URL(file, directory), 'utf8'));
  const { db } = await import('../lib/db/index.ts');
  for (const method of ['select', 'selectDistinctOn', 'insert', 'update', 'delete', 'transaction']) mock.method(db, method, embedded[method].bind(embedded));
  mock.method(db, 'execute', async query => (await embedded.execute(query)).rows);
  mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://api.anthropic.com/v1/messages'); providerCalls++;
    if (aiStatus !== 200) return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'private-provider-error-canary' } }), { status: aiStatus });
    const input = JSON.parse(options.body), name = input.tools[0].name;
    return new Response(JSON.stringify({ id: 'synthetic', type: 'message', role: 'assistant', model: input.model,
      stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: 'tool_use', id: 'synthetic-tool', name,
        input: name === 'classificar_email' ? { ...triagem, is_fatura_request: decision } : dados }] }),
    { headers: { 'content-type': 'application/json' } });
  });
  queue = await import('../lib/extraction/queue.ts'); worker = await import('../lib/extraction/worker.ts');
  processing = await import('../lib/extraction/processing.ts'); mutations = await import('../lib/drafts/mutations.ts');
  ({ loadInbox } = await import('../app/inbox/queries.ts'));
  ({ loadProcessingDetails: loadDetails } = await import('../lib/extraction/queue-queries.ts'));
  webhook = await import('../app/api/webhooks/postmark/route.ts'); endpoint = await import('../app/api/internal/email-worker/route.ts');
});
after(async () => { mock.restoreAll(); if (database) await database.close(); });

async function tenant() {
  const id = randomUUID(), emailInbound = `${id}@example.com`;
  const [row] = await embedded.insert(tenants).values({ id, nome: 'Empresa fictícia', emailInbound,
    emailInboundAuthorizedAddress: emailInbound, emailInboundAuthorizedAt: new Date(), notifEnabled: false }).returning();
  return row;
}
async function enqueue(owner = null, values = {}) {
  owner ??= await tenant();
  const received = await queue.enqueueInboundEmail({ tenantId: owner.id, fromEmail: 'client@example.com', toEmail: owner.emailInbound,
    subject: 'Teste', bodyText: 'Dados fictícios', rawPayload: { private: 'private-payload-canary' }, attachments: [],
    providerEventKey: `synthetic:${randomUUID()}`, ...values });
  return { owner, emailId: received.id };
}
const scope = fixture => ({ tenantId: fixture.owner.id, emailId: fixture.emailId });
const job = async id => (await embedded.select().from(jobs).where(eq(jobs.emailId, id)))[0];
const email = async id => (await embedded.select().from(emails).where(eq(emails.id, id)))[0];
async function expire(fixture) {
  await embedded.update(jobs).set({ leaseExpiresAt: sql`now() - interval '1 second'` }).where(eq(jobs.emailId, fixture.emailId));
  await embedded.update(emails).set({ processingStartedAt: sql`(now() at time zone 'UTC') - interval '6 minutes'` }).where(eq(emails.id, fixture.emailId));
}
async function ready(id) { await embedded.update(jobs).set({ availableAt: sql`now() - interval '1 second'` }).where(eq(jobs.emailId, id)); }

test('worker authentication fails closed and never accepts URL parameters or a missing secret', async () => {
  const request = token => new Request('http://localhost/api/internal/email-worker?secret=' + process.env.EMAIL_WORKER_SECRET,
    { headers: token ? { authorization: `Bearer ${token}` } : {} });
  for (const value of [null, 'wrong', 'b'.repeat(63), 'b'.repeat(65)]) {
    assert.equal(verifyEmailWorkerAuth(request(value)), false);
    assert.equal((await endpoint.POST(request(value))).status, 401);
  }
  assert.equal(verifyEmailWorkerAuth(request(process.env.EMAIL_WORKER_SECRET)), true);
  const saved = process.env.EMAIL_WORKER_SECRET; delete process.env.EMAIL_WORKER_SECRET;
  try { assert.equal(verifyEmailWorkerAuth(request(saved)), false); }
  finally { process.env.EMAIL_WORKER_SECRET = saved; }
});

test('email and task are committed together and duplicate deliveries cannot reset a failed task', async () => {
  const owner = await tenant(), key = `synthetic:${randomUUID()}`;
  const first = await enqueue(owner, { providerEventKey: key });
  const second = await enqueue(owner, { providerEventKey: key });
  assert.equal(first.emailId, second.emailId);
  assert.equal((await embedded.select().from(jobs).where(eq(jobs.emailId, first.emailId))).length, 1);
  const claim = await queue.claimNextEmailJob(scope(first));
  await queue.failEmailJob(claim, 'configuration', false);
  await enqueue(owner, { providerEventKey: key });
  assert.equal((await job(first.emailId)).status, 'failed');
  assert.equal((await job(first.emailId)).attempts, 1);
});

test('a failure to persist the task rolls back the email and refuses reception', async () => {
  const owner = await tenant(), key = `synthetic:${randomUUID()}`;
  await database.exec("create function synthetic_fail_job() returns trigger language plpgsql as $$ begin raise exception 'synthetic'; end $$; create trigger synthetic_fail_job before insert on email_processing_jobs for each row execute function synthetic_fail_job();");
  try {
    await assert.rejects(enqueue(owner, { providerEventKey: key }));
    assert.equal((await embedded.select().from(emails).where(eq(emails.providerEventKey, key))).length, 0);
  } finally { await database.exec('drop trigger synthetic_fail_job on email_processing_jobs; drop function synthetic_fail_job()'); }
});

test('webhook acknowledges only persisted reception without any AI calls', async () => {
  const owner = await tenant(), before = providerCalls;
  const response = await webhook.POST(new Request('http://localhost/api/webhooks/postmark', { method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from('synthetic-inbound:synthetic-password').toString('base64'), 'content-type': 'application/json' },
    body: JSON.stringify({ From: 'client@example.com', OriginalRecipient: owner.emailInbound, MessageID: randomUUID(), TextBody: 'Pedido fictício' }) }));
  assert.equal(response.status, 200); const received = await response.json();
  assert.equal((await job(received.id)).status, 'queued'); assert.equal(providerCalls, before);
});

test('an active reservation cannot be claimed twice and a foreign tenant cannot claim or requeue it', async () => {
  const fixture = await enqueue(), other = await tenant();
  assert.equal(await queue.claimNextEmailJob({ emailId: fixture.emailId, tenantId: other.id }), null);
  await assert.rejects(queue.enqueueOwnedEmail(fixture.emailId, other.id, 'force', 'synthetic-user'), queue.EmailQueueError);
  assert.ok(await queue.claimNextEmailJob(scope(fixture)));
  assert.equal(await queue.claimNextEmailJob(scope(fixture)), null);
});

test('an interrupted task is recovered but the former worker cannot publish a result or failure', async () => {
  const fixture = await enqueue(), first = await queue.claimNextEmailJob(scope(fixture));
  await expire(fixture); const next = await queue.claimNextEmailJob(scope(fixture));
  assert.notEqual(first.token, next.token); assert.equal(next.job.attempts, 2);
  assert.equal(await queue.completeEmailJob(first, { triagem, extracted: { dados, rawResponse: {} } }), false);
  assert.equal(await queue.failEmailJob(first, 'temporary', true), false);
  assert.equal(await queue.completeEmailJob(next, { triagem, extracted: { dados, rawResponse: {} } }), true);
  assert.equal((await job(fixture.emailId)).status, 'completed'); assert.equal((await email(fixture.emailId)).status, 'extracted');
});

test('expired workers cannot commit even if no successor has claimed the task', async () => {
  const fixture = await enqueue(), claim = await queue.claimNextEmailJob(scope(fixture)); await expire(fixture);
  assert.equal(await queue.completeEmailJob(claim, { triagem, extracted: { dados, rawResponse: {} } }), false);
  assert.equal(await queue.failEmailJob(claim, 'temporary', true), false);
});

test('transient failures use backoff, stop after three attempts and preserve the last valid draft', async () => {
  const fixture = await enqueue();
  const [draft] = await embedded.insert(faturasDraft).values({ emailId: fixture.emailId, tenantId: fixture.owner.id, status: 'pendente_revisao', clienteNome: 'Preservar' }).returning();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const claim = await queue.claimNextEmailJob(scope(fixture)); assert.equal(claim.job.attempts, attempt);
    assert.equal(await queue.failEmailJob(claim, 'temporary', true), true);
    const current = await job(fixture.emailId);
    assert.equal(current.status, attempt === 3 ? 'failed' : 'retry');
    if (attempt < 3) { assert.equal(await queue.claimNextEmailJob(scope(fixture)), null); await ready(fixture.emailId); }
  }
  assert.equal(await queue.claimNextEmailJob(scope(fixture)), null);
  assert.equal((await embedded.select().from(faturasDraft).where(eq(faturasDraft.id, draft.id)))[0].clienteNome, 'Preservar');
  assert.equal((await email(fixture.emailId)).status, 'extraction_failed');
});

test('a third interrupted reservation stops instead of creating an endless recovery loop', async () => {
  const fixture = await enqueue();
  for (let attempt = 0; attempt < 3; attempt++) { assert.ok(await queue.claimNextEmailJob(scope(fixture))); await expire(fixture); }
  assert.equal(await queue.claimNextEmailJob(scope(fixture)), null);
  assert.equal((await job(fixture.emailId)).status, 'failed'); assert.equal((await job(fixture.emailId)).attempts, 3);
});

test('quota deferral does not consume an AI attempt and never bypasses company limits', async () => {
  const fixture = await enqueue(), claim = await queue.claimNextEmailJob(scope(fixture));
  await queue.failEmailJob(claim, 'quota', true, 600);
  assert.equal((await job(fixture.emailId)).attempts, 0); assert.equal((await job(fixture.emailId)).status, 'retry');
  assert.equal(await queue.claimNextEmailJob(scope(fixture)), null);
});

test('revoked inbound authorization is checked again before the worker calls AI', async () => {
  const fixture = await enqueue(), before = providerCalls;
  await embedded.update(tenants).set({ emailInboundAuthorizedAt: null }).where(eq(tenants.id, fixture.owner.id));
  assert.equal(await worker.runEmailQueue(scope(fixture)), false);
  assert.equal((await job(fixture.emailId)).lastErrorCode, 'authorization'); assert.equal(providerCalls, before);
});

test('approved and inconsistent documents cannot be requeued or replaced by a queued task', async () => {
  for (const values of [{ status: 'aprovado' }, { status: 'emissao_em_curso' }, { status: 'pendente_revisao', moloniDocumentId: 9 },
    { status: 'pendente_revisao', tenantId: (await tenant()).id }]) {
    const fixture = await enqueue();
    const [draft] = await embedded.insert(faturasDraft).values({ emailId: fixture.emailId, tenantId: fixture.owner.id, ...values }).returning();
    assert.equal(await queue.claimNextEmailJob(scope(fixture)), null); assert.equal((await job(fixture.emailId)).status, 'cancelled');
    await embedded.update(emails).set({ status: 'extracted' }).where(eq(emails.id, fixture.emailId));
    await assert.rejects(queue.enqueueOwnedEmail(fixture.emailId, fixture.owner.id, 'force', 'synthetic-user'), queue.EmailQueueError);
    assert.deepEqual((await embedded.select().from(faturasDraft).where(eq(faturasDraft.id, draft.id)))[0], draft);
  }
});

test('queued and waiting emails refuse editing, approval, ignoring and deletion', async () => {
  for (const status of ['queued', 'retry_wait']) {
    const fixture = await enqueue();
    await embedded.update(emails).set({ status }).where(eq(emails.id, fixture.emailId));
    const [draft] = await embedded.insert(faturasDraft).values({ emailId: fixture.emailId, tenantId: fixture.owner.id, status: 'pendente_revisao' }).returning();
    await assert.rejects(mutations.mutateOwnedDraft(draft.id, fixture.owner.id, { kind: 'edit', data: { clienteNome: 'Alterar' } }));
    await assert.rejects(mutations.mutateOwnedDraft(draft.id, fixture.owner.id, { kind: 'approve', userId: null }));
    await assert.rejects(processing.ignoreEmail({ emailId: fixture.emailId, tenantId: fixture.owner.id, reviewedBy: null }));
    await assert.rejects(processing.deleteEmailSafely(fixture.emailId, fixture.owner.id));
  }
});

test('the real worker uses mocked AI and atomically publishes one draft and a completed task', async () => {
  const fixture = await enqueue(), before = providerCalls;
  aiStatus = 200; decision = 'sim'; assert.equal(await worker.runEmailQueue(scope(fixture)), true);
  assert.equal(providerCalls, before + 2); assert.equal((await job(fixture.emailId)).status, 'completed');
  assert.equal((await embedded.select().from(faturasDraft).where(eq(faturasDraft.emailId, fixture.emailId))).length, 1);
  assert.equal(await worker.runEmailQueue(scope(fixture)), false);
});

test('negative triage completes without extraction and manual force bypasses only triage', async () => {
  const fixture = await enqueue(), before = providerCalls; decision = 'nao';
  await worker.runEmailQueue(scope(fixture)); assert.equal(providerCalls, before + 1);
  assert.equal((await email(fixture.emailId)).status, 'ignored');
  await queue.enqueueOwnedEmail(fixture.emailId, fixture.owner.id, 'force', 'synthetic-user');
  await worker.runEmailQueue(scope(fixture)); assert.equal(providerCalls, before + 2);
  assert.equal((await email(fixture.emailId)).status, 'extracted'); decision = 'sim';
});

test('provider errors are classified and never persisted verbatim in job diagnostics or history', async () => {
  const fixture = await enqueue(); aiStatus = 503;
  try { await worker.runEmailQueue(scope(fixture)); }
  finally { aiStatus = 200; }
  assert.equal((await job(fixture.emailId)).status, 'retry');
  const details = await loadDetails(fixture.emailId, fixture.owner.id);
  for (const canary of ['private-provider-error-canary', 'private-payload-canary', process.env.ANTHROPIC_API_KEY, 'processingToken', 'token']) {
    assert.ok(!JSON.stringify(details).includes(canary));
  }
  assert.deepEqual(await loadDetails(fixture.emailId, (await tenant()).id), { job: null, events: [] });
});

test('queue states and failures with old drafts remain visible once, without leaking job tokens', async () => {
  const fixture = await enqueue();
  await embedded.insert(faturasDraft).values({ emailId: fixture.emailId, tenantId: fixture.owner.id, status: 'rejeitado' });
  const { parseInboxFilters } = await import('../lib/inbox/filters.ts');
  assert.equal((await loadInbox(fixture.owner.id, parseInboxFilters({ status: 'queued' }))).total, 1);
  assert.equal((await loadInbox(fixture.owner.id, parseInboxFilters({ tab: 'concluidas' }))).total, 0);
  const claim = await queue.claimNextEmailJob(scope(fixture)); await queue.failEmailJob(claim, 'configuration', false);
  const listed = await loadInbox(fixture.owner.id, parseInboxFilters({ status: 'extraction_failed' }));
  assert.equal(listed.total, 1); assert.ok(!JSON.stringify(listed).includes(claim.token));
});

test('a draft write failure cannot leave a completed task or overwrite the prior draft', async () => {
  const fixture = await enqueue();
  const [old] = await embedded.insert(faturasDraft).values({ emailId: fixture.emailId, tenantId: fixture.owner.id, status: 'pendente_revisao', clienteNome: 'Preservar' }).returning();
  const claim = await queue.claimNextEmailJob(scope(fixture));
  await database.exec("create function synthetic_fail_draft() returns trigger language plpgsql as $$ begin raise exception 'synthetic'; end $$; create trigger synthetic_fail_draft before insert on faturas_draft for each row execute function synthetic_fail_draft();");
  try {
    await assert.rejects(queue.completeEmailJob(claim, { triagem, extracted: { dados, rawResponse: {} } }));
    assert.equal((await job(fixture.emailId)).status, 'running'); assert.equal((await email(fixture.emailId)).status, 'processing');
    assert.deepEqual((await embedded.select().from(faturasDraft).where(eq(faturasDraft.id, old.id)))[0], old);
  } finally { await database.exec('drop trigger synthetic_fail_draft on faturas_draft; drop function synthetic_fail_draft()'); }
});

test('queue migration recovers only interrupted unprotected emails and never reopens completed tasks', async () => {
  const owner = await tenant(), ids = [];
  for (const status of ['received', 'processing', 'extraction_failed', 'ignored']) {
    const id = randomUUID(); ids.push(id);
    await embedded.insert(emails).values({ id, tenantId: owner.id, status, fromEmail: 'client@example.com', toEmail: owner.emailInbound, rawPayload: {} });
  }
  const protectedId = randomUUID();
  await embedded.insert(emails).values({ id: protectedId, tenantId: owner.id, status: 'received', fromEmail: 'client@example.com', toEmail: owner.emailInbound, rawPayload: {} });
  await embedded.insert(faturasDraft).values({ emailId: protectedId, tenantId: owner.id, status: 'aprovado' });
  const migration = await readFile(new URL('../drizzle/0011_email_processing_queue.sql', import.meta.url), 'utf8');
  await database.exec(migration); await database.exec(migration);
  assert.ok(await job(ids[0])); assert.ok(await job(ids[1]));
  assert.equal(await job(ids[2]), undefined); assert.equal(await job(ids[3]), undefined); assert.equal(await job(protectedId), undefined);
  await embedded.update(jobs).set({ status: 'completed' }).where(eq(jobs.emailId, ids[0]));
  await database.exec(migration); assert.equal((await job(ids[0])).status, 'completed');
});

test('missing worker configuration refuses persistence and an AI authentication error stops automatic retries', async () => {
  const owner = await tenant(), key = process.env.EMAIL_WORKER_SECRET; delete process.env.EMAIL_WORKER_SECRET;
  try { await assert.rejects(enqueue(owner), queue.EmailQueueError); }
  finally { process.env.EMAIL_WORKER_SECRET = key; }
  assert.equal((await embedded.select().from(emails).where(eq(emails.tenantId, owner.id))).length, 0);
  const fixture = await enqueue(); aiStatus = 401;
  try { await worker.runEmailQueue(scope(fixture)); }
  finally { aiStatus = 200; }
  assert.equal((await job(fixture.emailId)).status, 'failed'); assert.equal((await job(fixture.emailId)).lastErrorCode, 'configuration');
});
