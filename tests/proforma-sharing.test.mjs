import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { before, after, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from '../lib/db/schema.ts';
import { formatShareDate, parseShareOptions, SHARE_TOKEN_RE, shareState } from '../lib/proformas/share-policy.ts';

process.env.DATABASE_URL = 'postgres://share_test:share_test@127.0.0.1:1/share_test';
let database, embedded, sharing, publicPdf, migration, legacy, migrationStartedAt, migrationFinishedAt;
const token = () => randomBytes(24).toString('base64url');

before(async () => {
  database = new PGlite();
  embedded = drizzle(database, { schema });
  const directory = new URL('../drizzle/', import.meta.url);
  const names = (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  for (const name of names.filter(name => !name.startsWith('0009'))) await database.exec(await readFile(new URL(name, directory), 'utf8'));
  legacy = { id: randomUUID(), token: token() };
  await database.query('insert into faturas_draft (id, status, proforma_numero, proforma_share_token) values ($1, $2, $3, $4)',
    [legacy.id, 'emitida_proforma', 1, legacy.token]);
  migration = await readFile(new URL('0009_proforma_share_expiry.sql', directory), 'utf8');
  migrationStartedAt = Date.now();
  await database.exec(migration);
  migrationFinishedAt = Date.now();
  const { db } = await import('../lib/db/index.ts');
  for (const method of ['transaction', 'select', 'update']) mock.method(db, method, embedded[method].bind(embedded));
  mock.method(db, 'execute', async query => (await embedded.execute(query)).rows);
  sharing = await import('../lib/proformas/sharing.ts');
  publicPdf = await import('../app/api/p/[token]/pdf/route.ts');
});

after(async () => { mock.restoreAll(); if (database) await database.close(); });

async function fixture(values = {}) {
  const tenantId = randomUUID(), draftId = randomUUID(), emailId = randomUUID();
  await embedded.insert(schema.tenants).values({ id: tenantId, nome: 'Empresa exemplo', emailInbound: `${tenantId}@example.com`,
    moloniApiKeyEnc: 'private-fixture-key' });
  await embedded.insert(schema.emails).values({ id: emailId, tenantId, fromEmail: 'cliente@example.com', toEmail: 'pedidos@example.com', rawPayload: {} });
  await embedded.insert(schema.faturasDraft).values({ id: draftId, emailId, tenantId, status: 'emitida_proforma', proformaNumero: 1,
    items: [{ descricao: 'Consultoria', quantidade: 1, preco_unitario: 100, iva_percentagem: 23 }], rawIaResponse: { private: true }, ...values });
  return { tenantId, draftId, emailId };
}

const row = async id => (await embedded.select().from(schema.faturasDraft).where(eq(schema.faturasDraft.id, id)))[0];

test('share options allow only bounded durations and real booleans and tokens', () => {
  assert.deepEqual(parseShareOptions({}), { regenerate: false, days: 7 });
  for (const days of [1, 7, 30]) assert.equal(parseShareOptions({ days }).days, days);
  for (const value of [null, [], 7, { days: 0 }, { days: 365 }, { days: '7' }, { days: NaN }, { days: null },
    { regenerate: 'false' }, { expectedToken: 'short' }, { expectedToken: {} }, { tenantId: randomUUID() }]) {
    assert.throws(() => parseShareOptions(value));
  }
  assert.equal(shareState(true, '2030-01-01T00:00:00Z', Date.parse('2030-01-01T00:00:00Z')), 'expired');
  assert.equal(shareState(true, null, 0), 'expired');
  assert.equal(shareState(true, 'invalid', 0), 'expired');
  assert.equal(shareState(false, '2030-01-01T00:00:00Z', 0), 'inactive');
  assert.match(formatShareDate('2030-07-01T12:00:00Z'), /13:00/);
  assert.match(formatShareDate('2030-01-01T12:00:00Z'), /12:00/);
  assert.equal(formatShareDate('invalid'), '-');
});

test('migration bounds existing links once and never reactivates expired links on rerun', async () => {
  const original = await row(legacy.id);
  const expires = original.proformaShareExpiresAt.getTime();
  assert.ok(expires >= migrationStartedAt + 7 * 86_400_000 - 1000);
  assert.ok(expires <= migrationFinishedAt + 7 * 86_400_000 + 1000);
  await database.exec(migration);
  assert.equal((await row(legacy.id)).proformaShareExpiresAt.getTime(), original.proformaShareExpiresAt.getTime());
  const expired = new Date('2020-01-01T00:00:00Z');
  await embedded.update(schema.faturasDraft).set({ proformaShareExpiresAt: expired }).where(eq(schema.faturasDraft.id, legacy.id));
  await database.exec(migration);
  assert.equal((await row(legacy.id)).proformaShareExpiresAt.getTime(), expired.getTime());
});

test('generation uses 192-bit random tokens and selected deadlines; copying never extends them', async () => {
  for (const days of [1, 7, 30]) {
    const f = await fixture();
    const share = await sharing.changeProformaShare(f.draftId, f.tenantId, 'get', { days, expectedToken: null });
    assert.match(share.token, SHARE_TOKEN_RE);
    assert.ok(Math.abs(share.expiresAt.getTime() - Date.now() - days * 86_400_000) < 15_000);
    const copied = await sharing.changeProformaShare(f.draftId, f.tenantId, 'get', { days: 30, expectedToken: share.token });
    assert.equal(copied.token, share.token);
    assert.equal(copied.expiresAt.getTime(), share.expiresAt.getTime());
  }
});

test('active public lookup returns only document data, not tenant credentials or AI payloads', async () => {
  const f = await fixture();
  const share = await sharing.changeProformaShare(f.draftId, f.tenantId, 'get', {});
  const publicDocument = await sharing.getPublicProforma(share.token);
  assert.equal(publicDocument.tenant.id, f.tenantId);
  assert.equal(publicDocument.draft.id, f.draftId);
  assert.equal('moloniApiKeyEnc' in publicDocument.tenant, false);
  assert.equal('rawIaResponse' in publicDocument.draft, false);
  assert.equal('proformaShareToken' in publicDocument.draft, false);
});

test('renewal invalidates old tokens and resets tracking; stale tabs cannot revoke the replacement', async () => {
  const f = await fixture();
  const old = await sharing.changeProformaShare(f.draftId, f.tenantId, 'get', {});
  await sharing.recordShareOpening(f.draftId, old.token);
  assert.ok((await row(f.draftId)).proformaShareOpenedAt);
  const fresh = await sharing.changeProformaShare(f.draftId, f.tenantId, 'get', { regenerate: true, days: 1, expectedToken: old.token });
  assert.notEqual(fresh.token, old.token);
  assert.equal(await sharing.getPublicProforma(old.token), null);
  assert.equal((await row(f.draftId)).proformaShareOpenedAt, null);
  await sharing.recordShareOpening(f.draftId, old.token);
  assert.equal((await row(f.draftId)).proformaShareOpenedAt, null);
  for (const operation of ['get', 'revoke']) await assert.rejects(
    sharing.changeProformaShare(f.draftId, f.tenantId, operation, { expectedToken: old.token }), /mudou noutro separador/);
  assert.ok(await sharing.getPublicProforma(fresh.token));
});

test('revocation removes public access without changing the emitted document or private PDF inputs', async () => {
  const f = await fixture();
  const share = await sharing.changeProformaShare(f.draftId, f.tenantId, 'get', {});
  const before = await row(f.draftId);
  await sharing.changeProformaShare(f.draftId, f.tenantId, 'revoke', { expectedToken: share.token });
  const after = await row(f.draftId);
  assert.equal(after.proformaShareToken, null);
  assert.equal(after.proformaShareExpiresAt, null);
  assert.equal(after.status, before.status);
  assert.equal(after.proformaNumero, before.proformaNumero);
  assert.deepEqual(after.items, before.items);
  assert.equal(await sharing.getPublicProforma(share.token), null);
  assert.equal((await publicPdf.GET(new Request('http://example.com'), { params: Promise.resolve({ token: share.token }) })).status, 404);
});

test('expired, missing-deadline, malformed and non-proforma tokens cannot open the public PDF', async () => {
  for (const values of [{ proformaShareExpiresAt: new Date(0) }, { proformaShareExpiresAt: null },
    { status: 'emitida' }, { proformaNumero: null }, { proformaNumero: 0 }]) {
    const f = await fixture({ proformaShareToken: token(), proformaShareExpiresAt: new Date(Date.now() + 60_000), ...values });
    const draft = await row(f.draftId);
    assert.equal(await sharing.getPublicProforma(draft.proformaShareToken), null);
    const result = await publicPdf.GET(new Request('http://example.com'), { params: Promise.resolve({ token: draft.proformaShareToken }) });
    assert.equal(result.status, 404);
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
  }
  for (const invalid of ['short', 'a'.repeat(33), '<script>', token()]) {
    assert.equal(await sharing.getPublicProforma(invalid), null);
  }
});

test('generation replaces expired links rather than resurrecting the same public credential', async () => {
  const oldToken = token();
  const f = await fixture({ proformaShareToken: oldToken, proformaShareExpiresAt: new Date(0) });
  const fresh = await sharing.changeProformaShare(f.draftId, f.tenantId, 'get', { expectedToken: oldToken });
  assert.notEqual(fresh.token, oldToken);
  assert.ok(fresh.expiresAt > new Date());
  assert.equal(await sharing.getPublicProforma(oldToken), null);
});

test('share mutations reject foreign tenants, incomplete documents and malformed options without writing', async () => {
  const f = await fixture();
  const foreign = await fixture();
  await assert.rejects(sharing.changeProformaShare(f.draftId, foreign.tenantId, 'get', {}));
  await assert.rejects(sharing.changeProformaShare(f.draftId, foreign.tenantId, 'revoke', {}));
  await assert.rejects(sharing.changeProformaShare(f.draftId, f.tenantId, 'get', { days: 1000 }));
  assert.equal((await row(f.draftId)).proformaShareToken, null);
  for (const values of [{ status: 'pendente_revisao' }, { status: 'emitida' }, { proformaNumero: null }]) {
    const rejected = await fixture(values);
    await assert.rejects(sharing.changeProformaShare(rejected.draftId, rejected.tenantId, 'get', {}));
  }
});

test('simultaneous create requests converge on one token instead of returning orphaned links', async () => {
  const f = await fixture();
  const [a, b] = await Promise.all([sharing.changeProformaShare(f.draftId, f.tenantId, 'get', {}),
    sharing.changeProformaShare(f.draftId, f.tenantId, 'get', {})]);
  assert.equal(a.token, b.token);
  assert.equal(a.expiresAt.getTime(), b.expiresAt.getTime());
});
