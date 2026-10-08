import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { before, after, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../lib/db/schema.ts';
import { formatFullDate, formatRelativeTime } from '../lib/format/time.ts';

process.env.DATABASE_URL = 'postgres://navigation_test:navigation_test@127.0.0.1:1/navigation_test';
let database, embedded, loadDashboard, loadDetail, selects = 0;
before(async () => {
  database = new PGlite(); embedded = drizzle(database, { schema });
  const directory = new URL('../drizzle/', import.meta.url);
  for (const file of (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) await database.exec(await readFile(new URL(file, directory), 'utf8'));
  const { db } = await import('../lib/db/index.ts');
  mock.method(db, 'select', (...args) => { selects++; return embedded.select(...args); });
  mock.method(db, 'selectDistinctOn', embedded.selectDistinctOn.bind(embedded));
  ({ loadDashboard } = await import('../app/dashboard/queries.ts'));
  ({ loadOwnedEmailDetail: loadDetail } = await import('../lib/inbox/detail.ts'));
});
after(async () => { mock.restoreAll(); if (database) await database.close(); });
async function tenant() {
  const id = randomUUID(); await embedded.insert(schema.tenants).values({ id, nome: 'Teste', emailInbound: `${id}@example.com` }); return id;
}

test('dashboard loads seven bounded queries while preserving totals and tenant isolation', async () => {
  const owner = await tenant(), foreign = await tenant();
  for (let index = 0; index < 12; index++) await embedded.insert(schema.faturasDraft).values({ tenantId: owner,
    status: 'emitida_proforma', emittedAt: new Date(), clienteNome: `Cliente ${index % 6}`, clienteNif: String(index % 6), total: '12.30',
    confiancaExtracao: 'alta', items: [{ iva_percentagem: 23 }], rawIaResponse: { private: 'private-ai-canary' } });
  await embedded.insert(schema.faturasDraft).values({ tenantId: owner, status: 'rejeitado', total: '5000', clienteNome: 'Rejeitado' });
  await embedded.insert(schema.faturasDraft).values({ tenantId: foreign, status: 'emitida_proforma', total: '999999', clienteNome: 'Foreign canary' });
  selects = 0; const data = await loadDashboard(owner, 'pdf_proforma');
  assert.equal(selects, 7); assert.equal(data.emitidasMes, 12); assert.equal(data.receitaMes, 147.6);
  assert.equal(data.taxaAprovacao, 12 / 13); assert.equal(data.funnel.find(item => item.key === 'drafts').value, 13);
  assert.equal(data.topClientes.length, 5); assert.ok(data.topClientes.every(client => client.count === 2 && client.total === 24.6));
  assert.equal(data.atividade.length, 8); assert.equal(data.pedidosPorDia.length, 30);
  assert.deepEqual(data.distribuicaoConfianca, { alta: 12, media: 0, baixa: 0 });
  assert.ok(!JSON.stringify(data).includes('canary')); assert.equal((await loadDashboard(owner, 'moloni')).emitidasMes, 0);
});

test('detail returns attachment metadata without transferring duplicated content or raw payload', async () => {
  const owner = await tenant(), foreign = await tenant(), emailId = randomUUID();
  await embedded.insert(schema.emails).values({ id: emailId, tenantId: owner, fromEmail: 'client@example.com', toEmail: 'inbound@example.com',
    bodyText: 'Texto visível', bodyHtml: 'private-html-canary', rawPayload: { private: 'private-payload-canary' },
    attachments: [{ Name: 'example.pdf', ContentType: 'application/pdf', ContentLength: 1000000, Content: 'x'.repeat(1000000) }] });
  const detail = await loadDetail(emailId, owner);
  assert.deepEqual(detail.email.attachments, [{ Name: 'example.pdf', ContentType: 'application/pdf', ContentLength: 1000000 }]);
  assert.equal(detail.email.bodyText, 'Texto visível');
  assert.ok(JSON.stringify(detail).length < 1000); assert.ok(!JSON.stringify(detail).includes('private-'));
  assert.equal(await loadDetail(emailId, foreign), null);
});

test('navigation indexes initialize without changing documents or authorization on rerun', async () => {
  const indexes = await readFile(new URL('../drizzle/0012_navigation_indexes.sql', import.meta.url), 'utf8');
  const before = (await database.query('select count(*)::int as count from faturas_draft')).rows;
  await database.exec(indexes); await database.exec(indexes);
  assert.deepEqual((await database.query('select count(*)::int as count from faturas_draft')).rows, before);
  const names = (await database.query("select indexname from pg_indexes where schemaname='public'")).rows.map(row => row.indexname);
  for (const name of ['emails_tenant_created_idx', 'emails_tenant_sender_idx', 'drafts_tenant_email_latest_idx', 'drafts_tenant_status_idx']) assert.ok(names.includes(name));
});

test('shared date formatters use Lisbon time consistently in summer and winter', () => {
  assert.ok(formatFullDate('2026-06-08T18:15:00Z').includes('19:15'));
  assert.ok(formatFullDate('2026-12-08T18:15:00Z').includes('18:15'));
  for (const value of [null, undefined, 'invalid', new Date('invalid')]) {
    assert.equal(formatFullDate(value), ''); assert.equal(formatRelativeTime(value), '');
  }
});
