import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { after, before, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import { base64ByteLength } from '../lib/security/base64.ts';
import { csvCell } from '../lib/security/csv.ts';
import { fetchJson, ExternalRequestError } from '../lib/security/http.ts';
import { readJsonBody, RequestBodyError } from '../lib/security/request-body.ts';
import { validateInboundPayload } from '../lib/email/postmark-inbound.ts';
import { verifyPostmarkAuth } from '../lib/auth/postmark.ts';
import * as schema from '../lib/db/schema.ts';

// These tests never load .env.local or connect to an external database.
process.env.DATABASE_URL = 'postgres://security_test:security_test@127.0.0.1:1/security_test';
let database, embedded, rate, processing, persistence, applicationDb;
let server, origin, receivedRequests = 0;

before(async () => {
  database = new PGlite();
  embedded = drizzle(database, { schema });
  for (const table of [schema.tenants, schema.emails, schema.faturasDraft]) {
    const config = getTableConfig(table);
    const columns = config.columns.map((column) =>
      `"${column.name}" ${column.getSQLType()}${column.primary ? ' primary key default gen_random_uuid()' : ''}`,
    );
    await database.exec(`create table "${config.name}" (${columns.join(', ')})`);
  }
  await database.exec(await readFile(new URL('../drizzle/0008_security_limits.sql', import.meta.url), 'utf8'));
  ({ db: applicationDb } = await import('../lib/db/index.ts'));
  mock.method(applicationDb, 'execute', async (query) => (await embedded.execute(query)).rows);
  mock.method(applicationDb, 'transaction', embedded.transaction.bind(embedded));
  mock.method(applicationDb, 'update', embedded.update.bind(embedded));
  rate = await import('../lib/security/rate-limit.ts');
  processing = await import('../lib/extraction/processing.ts');
  persistence = await import('../lib/drafts/persist-extraction.ts');

  server = createServer((request, response) => {
    receivedRequests++;
    if (request.url === '/slow-headers') return;
    if (request.url === '/slow-body') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{');
      return;
    }
    if (request.url === '/redirect') {
      response.writeHead(302, { Location: '/ok' });
      response.end();
      return;
    }
    if (request.url === '/invalid') {
      response.end('private-response-data');
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  mock.restoreAll();
  if (database) await database.close();
});

test('outbound timeout aborts stalled headers and response bodies without retries', async () => {
  for (const path of ['/slow-headers', '/slow-body']) {
    const previousRequests = receivedRequests;
    const started = Date.now();
    await assert.rejects(fetchJson(`${origin}${path}`, { method: 'POST' }, { service: 'Test', timeoutMs: 100 }),
      (error) => error instanceof ExternalRequestError && error.outcomeUnknown);
    assert.ok(Date.now() - started < 2000);
    assert.equal(receivedRequests, previousRequests + 1);
  }
});

test('outbound JSON succeeds and rejects redirects and malformed responses without leaking data', async () => {
  const options = { service: 'Test', timeoutMs: 2000 };
  assert.deepEqual((await fetchJson(`${origin}/ok`, {}, options)).data, { ok: true });
  await assert.rejects(fetchJson(`${origin}/redirect`, {}, options), ExternalRequestError);
  await assert.rejects(fetchJson(`${origin}/invalid`, {}, options), (error) =>
    error instanceof ExternalRequestError && !error.message.includes('private-response-data'));
});

function jsonRequest(body, extra = {}) {
  return new Request('http://localhost/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body,
  });
}

test('JSON body limits use actual bytes even without an honest Content-Length', async () => {
  assert.deepEqual(await readJsonBody(jsonRequest('{"ok":true}'), 20, 1000), { ok: true });
  for (const headers of [{}, { 'content-length': '1' }]) {
    await assert.rejects(readJsonBody(jsonRequest('"' + 'a'.repeat(50) + '"', headers), 20, 1000),
      (error) => error instanceof RequestBodyError && error.status === 413);
  }
  await assert.rejects(readJsonBody(jsonRequest('{'), 20, 1000), (error) => error.status === 400);
  await assert.rejects(readJsonBody(new Request('http://localhost', { method: 'POST', body: '{}' }), 20, 1000),
    (error) => error.status === 415);
});

test('JSON body timeout cancels a stalled stream', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const request = new Request('http://localhost', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half',
  });
  await assert.rejects(readJsonBody(request, 20, 30), (error) => error.status === 408);
  assert.equal(cancelled, true);
});

test('inbound validation rejects wrong field types and ignores forged attachment sizes', () => {
  for (const value of [null, [], { From: 123 }, { Attachments: {} }]) {
    assert.throws(() => validateInboundPayload(value), RequestBodyError);
  }
  const data = Buffer.from('%PDF-small').toString('base64');
  const payload = validateInboundPayload({ Attachments: [
    { Name: 'test.pdf', ContentType: 'application/pdf', Content: data, ContentLength: 1 },
  ] });
  assert.equal(payload.Attachments[0].ContentLength, 10);
  assert.throws(() => validateInboundPayload({ Attachments: [
    { Name: 'test.pdf', ContentType: 'application/pdf', Content: 'AAAA'.repeat(1_100_000), ContentLength: 1 },
  ] }), (error) => error.status === 413);
  assert.equal(base64ByteLength('AA=='), 1);
  assert.equal(base64ByteLength('AAA='), 2);
  assert.equal(base64ByteLength('AA==AAAA'), null);
  assert.equal(base64ByteLength('%%%%'), null);
});

test('Postmark auth refuses absent configuration and invalid credentials', () => {
  const oldUser = process.env.POSTMARK_WEBHOOK_USER;
  const oldPassword = process.env.POSTMARK_WEBHOOK_PASSWORD;
  const request = (credentials) => ({ headers: new Headers(credentials ? {
    authorization: 'Basic ' + Buffer.from(credentials).toString('base64'),
  } : {}) });
  try {
    delete process.env.POSTMARK_WEBHOOK_USER;
    delete process.env.POSTMARK_WEBHOOK_PASSWORD;
    assert.equal(verifyPostmarkAuth(request()).ok, false);
    process.env.POSTMARK_WEBHOOK_USER = 'test';
    process.env.POSTMARK_WEBHOOK_PASSWORD = 'secret:with-colon';
    assert.equal(verifyPostmarkAuth(request('test:secret:with-colon')).ok, true);
    assert.equal(verifyPostmarkAuth(request('test:wrong')).ok, false);
    assert.equal(verifyPostmarkAuth(request('wrong:secret:with-colon')).ok, false);
  } finally {
    if (oldUser === undefined) delete process.env.POSTMARK_WEBHOOK_USER;
    else process.env.POSTMARK_WEBHOOK_USER = oldUser;
    if (oldPassword === undefined) delete process.env.POSTMARK_WEBHOOK_PASSWORD;
    else process.env.POSTMARK_WEBHOOK_PASSWORD = oldPassword;
  }
});

test('PostgreSQL rate counter caps a burst, isolates tenants, and resets after expiration', async () => {
  const policy = { name: 'test-burst', limit: 3, windowSeconds: 60 };
  const subject = randomUUID();
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => rate.enforceRateLimit(subject, policy)));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 3);
  for (const result of results.filter((result) => result.status === 'rejected')) {
    assert.ok(result.reason instanceof rate.RateLimitError);
    assert.ok(result.reason.retryAfter >= 1 && result.reason.retryAfter <= 60);
  }
  await rate.enforceRateLimit(randomUUID(), policy);
  const response = await rate.rateLimitResponse(subject, policy);
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('retry-after')) > 0);
  await database.exec("update security_rate_limits set expires_at = now() - interval '1 second'");
  await rate.enforceRateLimit(subject, policy);
});

test('rate limit fails closed when the database is unavailable', async () => {
  const execute = mock.method(applicationDb, 'execute', () => { throw new Error('database unavailable'); });
  try {
    const response = await rate.rateLimitResponse(randomUUID(), { name: 'test-outage', limit: 1, windowSeconds: 60 });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '30');
  } finally { execute.mock.restore(); }
});

async function createEmail() {
  const emailId = randomUUID(), tenantId = randomUUID();
  await embedded.insert(schema.emails).values({
    id: emailId, tenantId, fromEmail: 'client@example.com', toEmail: 'tenant@example.com',
    rawPayload: {}, status: 'received', createdAt: new Date(),
  });
  return { emailId, tenantId };
}

test('only one processing claim succeeds for repeated deliveries', async () => {
  const { emailId, tenantId } = await createEmail();
  const tokens = await Promise.all(Array.from({ length: 6 }, () => processing.claimEmailProcessing(emailId, tenantId)));
  assert.equal(tokens.filter(Boolean).length, 1);
  await processing.finishEmailProcessing(emailId, tokens.find(Boolean), 'extracted');
  assert.equal(await processing.claimEmailProcessing(emailId, tenantId), null);
});

test('expired processing can resume but an old worker cannot overwrite its successor', async () => {
  const { emailId, tenantId } = await createEmail();
  const oldToken = await processing.claimEmailProcessing(emailId, tenantId);
  await embedded.update(schema.emails).set({ processingStartedAt: new Date(Date.now() - 360_000) }).where(eq(schema.emails.id, emailId));
  const token = await processing.claimEmailProcessing(emailId, tenantId);
  assert.ok(token && token !== oldToken);
  await assert.rejects(processing.finishEmailProcessing(emailId, oldToken, 'extracted'));
  await assert.rejects(persistence.replaceDraftForEmail({
    emailId, tenantId, processingToken: oldToken, dados: { items: [] }, rawResponse: {},
  }));
  await persistence.replaceDraftForEmail({
    emailId, tenantId, processingToken: token, dados: { items: [] }, rawResponse: {},
  });
  await processing.finishEmailProcessing(emailId, token, 'extracted');
});

test('an approved document is protected from reprocessing and ignoring', async () => {
  const { emailId, tenantId } = await createEmail();
  await embedded.insert(schema.faturasDraft).values({ emailId, tenantId, status: 'aprovado' });
  await assert.rejects(processing.claimEmailProcessing(emailId, tenantId, true));
  await assert.rejects(processing.ignoreEmail({ emailId, tenantId, reviewedBy: 'test' }));
  const [draft] = await embedded.select().from(schema.faturasDraft).where(eq(schema.faturasDraft.emailId, emailId));
  assert.equal(draft.status, 'aprovado');
});

test('CSV quotes values and neutralizes spreadsheet formulas', () => {
  assert.equal(csvCell('Empresa "Teste"'), '"Empresa ""Teste"""');
  for (const value of ['=1+1', '+cmd', '-1+2', '@SUM(A1)', '\t=1', '  =1']) {
    assert.ok(csvCell(value).startsWith('"\''));
  }
  assert.equal(csvCell('123456789'), '"123456789"');
});
