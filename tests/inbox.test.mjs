import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { after, before, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../lib/db/schema.ts';
import {
  INBOX_PAGE_SIZE, INBOX_QUERY_MAX_LENGTH, parseInboxFilters,
  hasInboxFilters, inboxHref, inboxDetailHref, safeInboxReturnHref,
} from '../lib/inbox/filters.ts';

process.env.DATABASE_URL = 'postgres://inbox_test:inbox_test@127.0.0.1:1/inbox_test';
let database, embedded, loadInbox;

before(async () => {
  database = new PGlite();
  embedded = drizzle(database, { schema });
  const directory = new URL('../drizzle/', import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
    await database.exec(await readFile(new URL(name, directory), 'utf8'));
  }
  const { db } = await import('../lib/db/index.ts');
  mock.method(db, 'select', embedded.select.bind(embedded));
  mock.method(db, 'selectDistinctOn', embedded.selectDistinctOn.bind(embedded));
  ({ loadInbox } = await import('../app/inbox/queries.ts'));
});

after(async () => {
  mock.restoreAll();
  if (database) await database.close();
});

async function company() {
  const id = randomUUID();
  await embedded.insert(schema.tenants).values({ id, nome: 'Empresa de teste', emailInbound: `${id}@example.com` });
  return id;
}

async function email(tenantId, overrides = {}, drafts = []) {
  const id = randomUUID();
  await embedded.insert(schema.emails).values({
    id, tenantId, fromEmail: 'remetente@example.com', toEmail: 'inbox@example.com',
    subject: 'Pedido', status: 'extracted', isFaturaRequest: 'sim',
    createdAt: new Date('2026-07-01T12:00:00Z'),
    bodyText: 'private-body-sentinel', attachments: [{ Content: 'private-attachment-sentinel' }],
    rawPayload: { private: 'private-payload-sentinel' }, ...overrides,
  });
  for (const draft of drafts) {
    await embedded.insert(schema.faturasDraft).values({
      id: randomUUID(), emailId: id, tenantId, status: 'pendente_revisao', clienteNome: 'Cliente',
      createdAt: new Date('2026-07-01T12:00:00Z'),
      rawIaResponse: { private: 'private-ai-sentinel' }, ...draft,
    });
  }
  return id;
}

const query = (tenantId, params = {}) => loadInbox(tenantId, parseInboxFilters(params));

test('inbox filters allow only known tabs and states, bound search and normalize pages', () => {
  const defaults = parseInboxFilters();
  assert.equal(defaults.tab, 'por-rever');
  assert.equal(defaults.page, 1);
  assert.equal(hasInboxFilters(defaults), false);
  assert.equal(parseInboxFilters({ q: '  Cliente  ' }).q, 'Cliente');
  assert.equal(parseInboxFilters({ q: 'x'.repeat(1000) }).q.length, INBOX_QUERY_MAX_LENGTH);
  for (const page of ['-1', '0', '1.5', '1e3', 'Infinity', '999999999999999999', ['2', '3']]) {
    assert.equal(parseInboxFilters({ page }).page, 1);
  }
  assert.equal(parseInboxFilters({ page: '27' }).page, 27);
  assert.equal(parseInboxFilters({ tab: 'invalid', status: 'emitida' }).status, '');
  assert.equal(parseInboxFilters({ tab: 'concluidas', status: 'emitida' }).status, 'emitida');
  assert.equal(parseInboxFilters({ tab: 'ignorados', status: 'processing' }).status, '');
  assert.equal(parseInboxFilters({ q: ['one', 'two'], tab: ['concluidas', 'ignorados'] }).q, '');
});

test('calendar validation rejects impossible, duplicated and reversed dates', () => {
  assert.equal(parseInboxFilters({ from: '2024-02-29' }).dateError, null);
  for (const from of ['2026-02-29', '2026-02-31', '2026-13-01', '2026-1-01', 'garbage', '9999-12-31', ['2026-01-01', '2026-01-02']]) {
    assert.ok(parseInboxFilters({ from }).dateError);
  }
  const reversed = parseInboxFilters({ from: '2026-07-02', to: '2026-07-01' });
  assert.ok(reversed.dateError);
  assert.equal(reversed.from, '2026-07-02');
  assert.equal(reversed.to, '2026-07-01');
});

test('navigation encodes search, retains filters and resets page and state when switching groups', () => {
  const filters = parseInboxFilters({ tab: 'concluidas', q: 'João & Filhos + 100%', status: 'emitida', from: '2026-07-01', to: '2026-07-31', page: '3' });
  const url = new URL(inboxHref(filters), 'https://example.com');
  assert.equal(url.searchParams.get('q'), filters.q);
  assert.equal(url.searchParams.get('page'), '3');
  const switched = new URL(inboxHref(filters, { tab: 'por-rever', status: '', page: 1 }), url);
  assert.equal(switched.searchParams.get('q'), filters.q);
  assert.equal(switched.searchParams.get('from'), filters.from);
  assert.equal(switched.searchParams.has('status'), false);
  assert.equal(switched.searchParams.has('page'), false);
  const detail = new URL(inboxDetailHref('example-id', filters), url);
  assert.equal(safeInboxReturnHref(detail.searchParams.get('returnTo')), inboxHref(filters));
});

test('detail return links cannot navigate offsite or retain unrecognized parameters', () => {
  for (const value of [undefined, ['//evil.test'], '//evil.test/inbox', 'https://evil.test/inbox', '/inbox-evil', '/inbox/../settings', '/inbox\\evil.test', 'javascript:alert(1)', '/inbox?' + 'x'.repeat(3000)]) {
    assert.equal(safeInboxReturnHref(value), '/inbox');
  }
  assert.equal(safeInboxReturnHref('/inbox?tab=concluidas&page=2&secret=ignored'), '/inbox?tab=concluidas&page=2');
});

test('full counts and stable pages expose every email beyond the old 50-record limit', async () => {
  const tenantId = await company();
  const ids = [];
  for (let index = 0; index < 61; index++) ids.push(await email(tenantId, {}, [{ total: '12.30' }]));
  const seen = [];
  for (const page of ['1', '2', '3']) {
    const result = await query(tenantId, { page });
    assert.equal(result.total, 61);
    assert.equal(result.counts['por-rever'], 61);
    assert.equal(result.totalPages, 3);
    assert.ok(result.rows.length <= INBOX_PAGE_SIZE);
    seen.push(...result.rows.map((row) => row.email.id));
  }
  assert.deepEqual(seen, ids.sort().reverse());
  assert.equal(new Set(seen).size, 61);
  const last = await query(tenantId, { page: '999999999999999' });
  assert.equal(last.page, 3);
  assert.equal(last.rows.length, 11);
});

test('listing and search never expose foreign-company drafts, counts or raw email content', async () => {
  const owned = await company(), foreign = await company();
  const ownId = await email(owned);
  await email(foreign, { subject: 'Segredo estrangeiro' }, [{ clienteNome: 'Cliente estrangeiro' }]);
  await embedded.insert(schema.faturasDraft).values({ id: randomUUID(), emailId: ownId, tenantId: foreign, status: 'emitida', clienteNome: 'Cliente estrangeiro' });
  const result = await query(owned);
  assert.deepEqual(result.counts, { 'por-rever': 1, concluidas: 0, ignorados: 0 });
  assert.equal(result.rows[0].email.id, ownId);
  assert.equal(result.rows[0].draft, null);
  assert.equal((await query(owned, { q: 'estrangeiro' })).total, 0);
  assert.equal((await query(foreign)).rows.some((row) => row.email.id === ownId), false);
  const serialized = JSON.stringify(result);
  for (const sentinel of ['private-body-sentinel', 'private-attachment-sentinel', 'private-payload-sentinel', 'private-ai-sentinel']) assert.ok(!serialized.includes(sentinel));
});

test('legacy duplicate drafts count one email and use its latest owned draft', async () => {
  const tenantId = await company();
  const id = await email(tenantId, {}, [
    { createdAt: new Date('2026-07-01T10:00:00Z'), status: 'pendente_revisao', clienteNome: 'Antigo' },
    { createdAt: new Date('2026-07-01T11:00:00Z'), status: 'aprovado', clienteNome: 'Atual' },
  ]);
  const result = await query(tenantId, { tab: 'concluidas' });
  assert.equal(result.total, 1);
  assert.equal(result.counts['por-rever'], 0);
  assert.equal(result.rows[0].email.id, id);
  assert.equal(result.rows[0].draft.clienteNome, 'Atual');
});

test('search covers client, sender, subject, client email and NIF without treating input as SQL', async () => {
  const tenantId = await company();
  const id = await email(tenantId, { fromEmail: 'compras@horizonte.example', subject: 'Orçamento especial' }, [
    { clienteNome: 'Estúdio Horizonte', clienteNif: '509123456', clienteEmail: 'cliente@atelier.example' },
  ]);
  await email(tenantId, { subject: 'Outra mensagem' });
  for (const q of ['ESTÚDIO', 'compras@horizonte', 'especial', 'cliente@atelier', '509123']) {
    const result = await query(tenantId, { q });
    assert.equal(result.total, 1);
    assert.equal(result.rows[0].email.id, id);
    assert.equal(result.counts['por-rever'], 2);
  }
  assert.equal((await query(tenantId, { q: "' OR true --" })).total, 0);
});

test('search percent, underscore and backslash are literal characters, not wildcards', async () => {
  const tenantId = await company();
  const percent = await email(tenantId, { subject: 'Orçamento 100%' });
  const underscore = await email(tenantId, { subject: 'Referência A_B' });
  const backslash = await email(tenantId, { subject: 'Caminho C:\\tmp' });
  for (const [q, id] of [['%', percent], ['_', underscore], ['\\', backslash]]) {
    const result = await query(tenantId, { q });
    assert.equal(result.total, 1);
    assert.equal(result.rows[0].email.id, id);
  }
});

test('state filters select only their group while totals remain complete', async () => {
  const tenantId = await company();
  const pending = await email(tenantId, {}, [{}]);
  const uncertain = await email(tenantId, { isFaturaRequest: 'incerto' });
  const processing = await email(tenantId, { status: 'processing' });
  const failedExtraction = await email(tenantId, { status: 'extraction_failed' });
  const failedEmission = await email(tenantId, {}, [{ status: 'falha_emissao' }]);
  const emitting = await email(tenantId, {}, [{ status: 'emissao_em_curso' }]);
  const emitted = await email(tenantId, {}, [{ status: 'emitida_proforma' }]);
  const approved = await email(tenantId, {}, [{ status: 'aprovado' }]);
  const ignored = await email(tenantId, { isFaturaRequest: 'nao', status: 'ignored' });
  for (const [status, id] of [['pendente_revisao', pending], ['incerto', uncertain], ['processing', processing], ['extraction_failed', failedExtraction], ['falha_emissao', failedEmission], ['emissao_em_curso', emitting]]) {
    const result = await query(tenantId, { status });
    assert.deepEqual(result.rows.map((row) => row.email.id), [id]);
    assert.deepEqual(result.counts, { 'por-rever': 6, concluidas: 2, ignorados: 1 });
  }
  assert.deepEqual((await query(tenantId, { tab: 'concluidas', status: 'emitida_proforma' })).rows.map((row) => row.email.id), [emitted]);
  assert.deepEqual((await query(tenantId, { tab: 'concluidas', status: 'aprovado' })).rows.map((row) => row.email.id), [approved]);
  assert.deepEqual((await query(tenantId, { tab: 'ignorados' })).rows.map((row) => row.email.id), [ignored]);
});

test('summer date filters use inclusive Lisbon dates rather than UTC calendar dates', async () => {
  const tenantId = await company();
  await email(tenantId, { createdAt: new Date('2026-06-30T22:59:59.999Z') });
  const first = await email(tenantId, { createdAt: new Date('2026-06-30T23:00:00Z') });
  const last = await email(tenantId, { createdAt: new Date('2026-07-01T22:59:59.999Z') });
  await email(tenantId, { createdAt: new Date('2026-07-01T23:00:00Z') });
  const result = await query(tenantId, { from: '2026-07-01', to: '2026-07-01' });
  assert.deepEqual(result.rows.map((row) => row.email.id), [last, first]);
  assert.equal(result.counts['por-rever'], 4);
});

test('winter and daylight-saving transitions preserve 24, 23 and 25-hour calendar days', async () => {
  for (const [day, start, end] of [
    ['2026-01-01', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'],
    ['2026-03-29', '2026-03-29T00:00:00Z', '2026-03-29T23:00:00Z'],
    ['2026-10-25', '2026-10-24T23:00:00Z', '2026-10-26T00:00:00Z'],
  ]) {
    const tenantId = await company();
    await email(tenantId, { createdAt: new Date(new Date(start).getTime() - 1) });
    const first = await email(tenantId, { createdAt: new Date(start) });
    const last = await email(tenantId, { createdAt: new Date(new Date(end).getTime() - 1) });
    await email(tenantId, { createdAt: new Date(end) });
    assert.deepEqual((await query(tenantId, { from: day, to: day })).rows.map((row) => row.email.id), [last, first]);
  }
});

test('invalid ranges return no results without crashing or silently broadening the query', async () => {
  const tenantId = await company();
  await email(tenantId);
  for (const params of [{ from: '2026-02-31' }, { from: '2026-07-02', to: '2026-07-01' }]) {
    const result = await query(tenantId, params);
    assert.equal(result.total, 0);
    assert.equal(result.rows.length, 0);
    assert.equal(result.page, 1);
  }
});

test('empty companies and searches return a valid first page', async () => {
  const tenantId = await company();
  const result = await query(tenantId, { tab: 'concluidas', page: '200' });
  assert.deepEqual(result.counts, { 'por-rever': 0, concluidas: 0, ignorados: 0 });
  assert.equal(result.page, 1);
  assert.equal(result.totalPages, 1);
  assert.equal(result.rows.length, 0);
});
