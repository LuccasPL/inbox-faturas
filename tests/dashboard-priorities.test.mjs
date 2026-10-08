import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { after, before, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from '../lib/db/schema.ts';
import { INBOX_PRIORITIES } from '../lib/inbox/priorities.ts';
import { hasInboxFilters, inboxDetailHref, inboxHref, parseInboxFilters, safeInboxReturnHref } from '../lib/inbox/filters.ts';

process.env.DATABASE_URL = 'postgres://priorities_test:priorities_test@127.0.0.1:1/priorities_test';
let database, embedded, loadInbox, loadDashboard, loadDashboardPriorities;
const hours = value => new Date(Date.now() + value * 3_600_000);

before(async () => {
  database = new PGlite();
  embedded = drizzle(database, { schema });
  const directory = new URL('../drizzle/', import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    await database.exec(await readFile(new URL(name, directory), 'utf8'));
  }
  const { db } = await import('../lib/db/index.ts');
  for (const method of ['select', 'selectDistinctOn']) mock.method(db, method, embedded[method].bind(embedded));
  ({ loadInbox } = await import('../app/inbox/queries.ts'));
  ({ loadDashboard } = await import('../app/dashboard/queries.ts'));
  ({ loadDashboardPriorities } = await import('../app/dashboard/priority-queries.ts'));
});

after(async () => { mock.restoreAll(); if (database) await database.close(); });

async function company() {
  const id = randomUUID();
  await embedded.insert(schema.tenants).values({ id, nome: 'Empresa fictícia', emailInbound: `${id}@example.com` });
  return id;
}

async function email(tenantId, values = {}, drafts = []) {
  const id = randomUUID();
  await embedded.insert(schema.emails).values({ id, tenantId, fromEmail: 'cliente@example.com', toEmail: 'pedidos@example.com',
    subject: 'Pedido fictício', createdAt: hours(-72), isFaturaRequest: 'sim', status: 'extracted',
    bodyText: 'private-body-sentinel', attachments: [{ Content: 'private-attachment-sentinel' }], rawPayload: { private: 'private-payload-sentinel' }, ...values });
  for (const draft of drafts) await embedded.insert(schema.faturasDraft).values({ id: randomUUID(), emailId: id, tenantId,
    createdAt: hours(-2), status: 'pendente_revisao', clienteNome: 'Cliente fictício', total: '123.00', items: [],
    rawIaResponse: { private: 'private-ai-sentinel' }, ...draft });
  return id;
}

const proforma = (expiry, overrides = {}) => ({ status: 'emitida_proforma', proformaNumero: 1,
  proformaShareToken: randomBytes(24).toString('base64url'), proformaShareExpiresAt: expiry, ...overrides });
const query = (tenantId, params = {}) => loadInbox(tenantId, parseInboxFilters(params));
const counts = groups => Object.fromEntries(groups.map(group => [group.id, group.count]));

test('priority filters accept only known priorities for their inbox group and safe return URLs', () => {
  for (const priority of INBOX_PRIORITIES) {
    const filters = parseInboxFilters({ tab: priority.tab, priority: priority.id, q: 'Cliente & Filhos', page: '2' });
    assert.equal(filters.priority, priority.id);
    assert.ok(hasInboxFilters(filters));
    const href = inboxHref(filters);
    assert.equal(new URL(href, 'https://example.com').searchParams.get('priority'), priority.id);
    const detail = new URL(inboxDetailHref('email-id', filters), 'https://example.com');
    assert.equal(safeInboxReturnHref(detail.searchParams.get('returnTo')), href);
    assert.equal(parseInboxFilters({ tab: 'ignorados', priority: priority.id }).priority, '');
    assert.equal(parseInboxFilters({ tab: priority.tab === 'concluidas' ? 'por-rever' : 'concluidas', priority: priority.id }).priority, '');
  }
  for (const priority of ['invalid', "' OR true --", ['falha-extracao', 'falha-emissao']]) assert.equal(parseInboxFilters({ priority }).priority, '');
  assert.equal(safeInboxReturnHref('/inbox?priority=invalid&secret=hidden'), '/inbox');
});

test('every dashboard priority opens the exact matching inbox set with no duplicate categories', async () => {
  const tenant = await company();
  const expected = {
    'emissao-incerta': await email(tenant, {}, [{ status: 'emissao_em_curso' }]),
    'falha-extracao': await email(tenant, { status: 'extraction_failed' }),
    'falha-emissao': await email(tenant, {}, [{ status: 'falha_emissao' }]),
    'revisao-antiga': await email(tenant, {}, [{}]),
    'link-a-expirar': await email(tenant, {}, [proforma(hours(24))]),
    'link-expirado': await email(tenant, {}, [proforma(hours(-24))]),
  };
  const groups = await loadDashboardPriorities(tenant);
  assert.equal(groups.reduce((sum, group) => sum + group.count, 0), 6);
  for (const group of groups) {
    assert.equal(group.count, 1);
    const inbox = await query(tenant, { tab: group.tab, priority: group.id });
    assert.equal(inbox.total, group.count);
    assert.deepEqual(inbox.rows.map(row => row.email.id), [expected[group.id]]);
  }
});

test('fresh, processing, ignored and completed requests do not become overdue reviews', async () => {
  const tenant = await company();
  const old = await email(tenant, { createdAt: hours(-49) });
  await email(tenant, { createdAt: hours(-47) }, [{}]);
  await email(tenant, { status: 'processing' });
  await email(tenant, { status: 'processing' }, [{}]);
  await email(tenant, { status: 'ignored', isFaturaRequest: 'nao' });
  for (const status of ['aprovado', 'emitida', 'rascunho_moloni', 'rejeitado']) await email(tenant, {}, [{ status }]);
  assert.equal(counts(await loadDashboardPriorities(tenant))['revisao-antiga'], 1);
  assert.deepEqual((await query(tenant, { priority: 'revisao-antiga' })).rows.map(row => row.email.id), [old]);
});

test('link priorities use bounded windows and exclude revoked links, missing deadlines and non-proformas', async () => {
  const tenant = await company();
  const soon = await email(tenant, {}, [proforma(hours(71))]);
  const recent = await email(tenant, {}, [proforma(hours(-167))]);
  for (const value of [proforma(hours(73)), proforma(hours(-169)), proforma(null), proforma(hours(24), { proformaShareToken: null }),
    proforma(hours(24), { status: 'emitida' }), proforma(hours(24), { proformaNumero: null })]) await email(tenant, {}, [value]);
  const result = counts(await loadDashboardPriorities(tenant));
  assert.equal(result['link-a-expirar'], 1);
  assert.equal(result['link-expirado'], 1);
  assert.deepEqual((await query(tenant, { tab: 'concluidas', priority: 'link-a-expirar' })).rows.map(row => row.email.id), [soon]);
  assert.deepEqual((await query(tenant, { tab: 'concluidas', priority: 'link-expirado' })).rows.map(row => row.email.id), [recent]);
});

test('legacy duplicates and foreign-company drafts cannot inflate priorities or dashboard pending totals', async () => {
  const owned = await company(), foreign = await company();
  await email(owned, {}, [{ createdAt: hours(-10), status: 'falha_emissao' }, { createdAt: hours(-1), status: 'aprovado' }]);
  const pending = await email(owned, { createdAt: hours(-1) }, [{ createdAt: hours(-10) }, { createdAt: hours(-1), status: 'emissao_em_curso' }]);
  const unextracted = await email(owned, { status: 'extraction_failed' });
  await embedded.insert(schema.faturasDraft).values({ emailId: unextracted, tenantId: foreign, status: 'emitida', clienteNome: 'Foreign sentinel' });
  await email(foreign, { status: 'extraction_failed' });
  const priorities = counts(await loadDashboardPriorities(owned));
  assert.equal(priorities['falha-emissao'], 0);
  assert.equal(priorities['emissao-incerta'], 1);
  assert.equal(priorities['falha-extracao'], 1);
  assert.deepEqual((await query(owned, { priority: 'emissao-incerta' })).rows.map(row => row.email.id), [pending]);
  assert.equal((await loadDashboard(owned, 'pdf_proforma')).porRever, (await query(owned)).counts['por-rever']);
  assert.equal((await loadDashboard(owned, 'moloni')).porRever, 2);
});

test('priority windows do not depend on the database session timezone', async () => {
  const tenant = await company();
  await email(tenant, { createdAt: hours(-49) });
  await email(tenant, { createdAt: hours(-47) });
  await email(tenant, {}, [proforma(hours(71))]);
  await email(tenant, {}, [proforma(hours(-167))]);
  let expected;
  try {
    for (const zone of ['UTC', 'Europe/Lisbon', 'America/Los_Angeles', 'Asia/Tokyo']) {
      await database.query("select set_config('TimeZone', $1, false)", [zone]);
      const actual = counts(await loadDashboardPriorities(tenant));
      if (!expected) expected = actual;
      assert.deepEqual(actual, expected);
    }
  } finally { await database.exec("set time zone 'UTC'"); }
});

test('priority filtering preserves complete totals and supports search, dates and stable pagination', async () => {
  const tenant = await company();
  const ids = [];
  for (let index = 0; index < 27; index++) ids.push(await email(tenant, { subject: 'Cliente especial', createdAt: hours(-80 - index) }));
  await email(tenant, { createdAt: hours(-1) }, [{}]);
  const first = await query(tenant, { priority: 'revisao-antiga', q: 'especial' });
  const second = await query(tenant, { priority: 'revisao-antiga', q: 'especial', page: '2' });
  assert.equal(first.total, 27);
  assert.equal(first.counts['por-rever'], 28);
  assert.equal(first.totalPages, 2);
  assert.equal(first.rows.length, 25);
  assert.equal(second.rows.length, 2);
  assert.deepEqual([...first.rows, ...second.rows].map(row => row.email.id), ids.reverse());
  assert.equal((await query(tenant, { priority: 'revisao-antiga', q: 'missing' })).total, 0);
  assert.equal((await query(tenant, { priority: 'revisao-antiga', from: '2026-02-31' })).total, 0);
  assert.equal(counts(await loadDashboardPriorities(tenant))['revisao-antiga'], 27);
});

test('link listings order urgent deadlines first and include dates but never public tokens or email payloads', async () => {
  const tenant = await company();
  const late = await email(tenant, {}, [proforma(hours(48))]);
  const urgent = await email(tenant, {}, [proforma(hours(1))]);
  const result = await query(tenant, { tab: 'concluidas', priority: 'link-a-expirar' });
  assert.deepEqual(result.rows.map(row => row.email.id), [urgent, late]);
  assert.ok(result.rows.every(row => row.draft.shareExpiresAt instanceof Date));
  const serialized = JSON.stringify([result, await loadDashboardPriorities(tenant)]);
  for (const value of ['private-body-sentinel', 'private-attachment-sentinel', 'private-payload-sentinel', 'private-ai-sentinel', 'proformaShareToken']) {
    assert.ok(!serialized.includes(value));
  }
  const before = (await embedded.select().from(schema.faturasDraft).where(eq(schema.faturasDraft.emailId, urgent)))[0];
  await loadDashboardPriorities(tenant);
  assert.deepEqual((await embedded.select().from(schema.faturasDraft).where(eq(schema.faturasDraft.emailId, urgent)))[0], before);
});

test('empty companies return zero counts and a valid empty priority page', async () => {
  const tenant = await company();
  assert.ok((await loadDashboardPriorities(tenant)).every(group => group.count === 0));
  const inbox = await query(tenant, { priority: 'falha-extracao', page: '999' });
  assert.equal(inbox.total, 0);
  assert.equal(inbox.page, 1);
  assert.equal(inbox.totalPages, 1);
  assert.deepEqual(inbox.rows, []);
});
