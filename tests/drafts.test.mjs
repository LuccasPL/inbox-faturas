import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { before, after, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { and, eq } from 'drizzle-orm';
import { calculateTotals, calculateDocumentTotals, calculationVersion } from '../lib/faturas/totals.ts';
import { parseDraftItems, parseDraftPatch, parseExtractedDraft, validateDraftForReview, DraftValidationError } from '../lib/validation/draft.ts';
import { mapDraftToInvoice } from '../lib/moloni/map-draft-to-invoice.ts';
import { MoloniApiError, safeMoloniError } from '../lib/moloni/client.ts';
import * as schema from '../lib/db/schema.ts';

process.env.DATABASE_URL = 'postgres://draft_test:draft_test@127.0.0.1:1/draft_test';
const line = { descricao: 'Serviço', quantidade: 2, preco_unitario: 100, iva_percentagem: 23 };
const complete = { clienteNome: 'Cliente', clienteNif: null, clienteEmail: null, iban: null, items: [line] };
let database, embedded, mutations;

before(async () => {
  database = new PGlite();
  embedded = drizzle(database, { schema });
  for (const table of [schema.tenants, schema.emails, schema.faturasDraft]) {
    const config = getTableConfig(table);
    const columns = config.columns.map((column) =>
      `"${column.name}" ${column.getSQLType()}${column.primary ? ' primary key default gen_random_uuid()' : ''}`);
    await database.exec(`create table "${config.name}" (${columns.join(', ')})`);
  }
  const { db } = await import('../lib/db/index.ts');
  mock.method(db, 'transaction', embedded.transaction.bind(embedded));
  mutations = await import('../lib/drafts/mutations.ts');
});

after(async () => {
  mock.restoreAll();
  if (database) await database.close();
});

async function fixture(overrides = {}, emailStatus = 'extracted') {
  const tenantId = randomUUID(), emailId = randomUUID(), draftId = randomUUID();
  await embedded.insert(schema.tenants).values({ id: tenantId, nome: 'Teste', emailInbound: `${tenantId}@example.com` });
  await embedded.insert(schema.emails).values({ id: emailId, tenantId, status: emailStatus,
    fromEmail: 'client@example.com', toEmail: 'inbound@example.com', rawPayload: {} });
  await embedded.insert(schema.faturasDraft).values({ id: draftId, tenantId, emailId,
    ...complete, status: 'pendente_revisao', subtotal: '999', ivaValor: '999', total: '999', ...overrides });
  return { tenantId, emailId, draftId };
}

test('decimal totals avoid binary rounding errors and reconcile displayed components', () => {
  assert.deepEqual(calculateTotals([line]), { subtotal: 200, ivaValor: 46, total: 246 });
  assert.deepEqual(calculateTotals([{ ...line, quantidade: 1, preco_unitario: 1.005, iva_percentagem: 0 }]),
    { subtotal: 1.01, ivaValor: 0, total: 1.01 });
  assert.deepEqual(calculateTotals([{ ...line, quantidade: 0.1, preco_unitario: 0.2, iva_percentagem: 0 }]),
    { subtotal: 0.02, ivaValor: 0, total: 0.02 });
  assert.deepEqual(calculateTotals([]), { subtotal: 0, ivaValor: 0, total: 0 });
  const fractional = calculateTotals([{ ...line, quantidade: 1, preco_unitario: 0.025, iva_percentagem: 23 }]);
  assert.equal(fractional.total, 0.04);
});

test('patch parser rejects internal fields and ignores forged totals from older clients', () => {
  assert.deepEqual(parseDraftPatch({ items: [line], subtotal: -1, ivaValor: 900, total: 0 }), { items: [line] });
  for (const payload of [null, [], {}, { total: 0 }, { status: 'emitida' },
    { tenantId: randomUUID() }, { moloniApiKeyEnc: 'secret' }, { clienteNome: {} }, { observacoes: 'x'.repeat(4001) }]) {
    assert.throws(() => parseDraftPatch(payload), DraftValidationError);
  }
  assert.deepEqual(parseDraftPatch({ clienteNome: ' Cliente ', clienteEmail: '' }), { clienteNome: 'Cliente', clienteEmail: null });
});

test('previously issued proformas retain their original rounding and new ones use version 2', () => {
  const fractional = [{ ...line, quantidade: 1, preco_unitario: 0.025 }];
  assert.equal(calculationVersion(null), 1);
  assert.equal(calculateDocumentTotals(fractional, 1).total, 0.03);
  assert.equal(calculationVersion({ calculo_versao: 2 }), 2);
  assert.equal(calculateDocumentTotals(fractional, 2).total, 0.04);
});

test('line validation bounds count, precision, types, amounts and tax rates', () => {
  for (const value of [null, {}, [null], Array(101).fill(line),
    [{ ...line, quantidade: NaN }], [{ ...line, quantidade: Infinity }],
    [{ ...line, quantidade: '2' }], [{ ...line, quantidade: -1 }],
    [{ ...line, quantidade: 0.00001 }], [{ ...line, preco_unitario: 1e9 }],
    [{ ...line, preco_unitario: 0.0000001 }], [{ ...line, iva_percentagem: 101 }],
    [{ ...line, quantidade: 1e6, preco_unitario: 1e6 }], [{ ...line, descricao: 'x'.repeat(1001) }]]) {
    assert.throws(() => parseDraftItems(value), DraftValidationError);
  }
});

test('incomplete drafts remain editable but cannot be approved or emitted', () => {
  const incomplete = { ...line, descricao: '', quantidade: 0 };
  assert.deepEqual(parseDraftPatch({ items: [incomplete] }), { items: [incomplete] });
  for (const input of [{ ...complete, items: [] }, { ...complete, items: [incomplete] },
    { ...complete, clienteNome: ' ' }, { ...complete, clienteNif: '123' },
    { ...complete, clienteEmail: 'not-email' }, { ...complete, iban: 'PT50123' }]) {
    assert.throws(() => validateDraftForReview(input), DraftValidationError);
  }
  assert.deepEqual(validateDraftForReview(complete), [line]);
});

test('AI output is validated, normalized and discrepancies require human review', () => {
  const data = parseExtractedDraft({ cliente_nome: 'Cliente', items: [line],
    subtotal: 1, iva_valor: 0, total: 1, confianca_extracao: 'alta', notas_extracao: 'Original' });
  assert.equal(data.total, 246);
  assert.equal(data.confianca_extracao, 'baixa');
  assert.match(data.notas_extracao, /diferem das linhas/);
  const empty = parseExtractedDraft({ items: [], confianca_extracao: 'alta' });
  assert.equal(empty.total, null);
  assert.equal(empty.confianca_extracao, 'baixa');
  for (const bad of [{ items: [line], confianca_extracao: 'inventada' },
    { items: [{ ...line, quantidade: '2' }], confianca_extracao: 'alta' },
    { items: [line], confianca_extracao: 'alta', total: { secret: true } }]) {
    assert.throws(() => parseExtractedDraft(bad), DraftValidationError);
  }
});

test('saving derives authoritative totals and prevents cross-tenant writes', async () => {
  const { tenantId, draftId } = await fixture();
  const updated = await mutations.mutateOwnedDraft(draftId, tenantId,
    { kind: 'edit', data: { items: [line], subtotal: 0, ivaValor: 0, total: 0 } });
  assert.equal(updated.total, '246.00');
  assert.equal(updated.ivaValor, '46.00');
  await assert.rejects(mutations.mutateOwnedDraft(draftId, randomUUID(),
    { kind: 'edit', data: { clienteNome: 'Outro' } }), DraftValidationError);
  const [persisted] = await embedded.select().from(schema.faturasDraft).where(eq(schema.faturasDraft.id, draftId));
  assert.equal(persisted.clienteNome, 'Cliente');
});

test('approval atomically snapshots validated data, recalculates totals and updates the email', async () => {
  const { tenantId, emailId, draftId } = await fixture();
  const approved = await mutations.mutateOwnedDraft(draftId, tenantId, { kind: 'approve', userId: 'user_test' });
  assert.equal(approved.status, 'aprovado');
  assert.equal(approved.total, '246.00');
  assert.equal(approved.dadosFinais.total, '246.00');
  assert.equal(approved.reviewedBy, 'user_test');
  const [email] = await embedded.select().from(schema.emails).where(eq(schema.emails.id, emailId));
  assert.equal(email.status, 'approved');
  await assert.rejects(mutations.mutateOwnedDraft(draftId, tenantId, { kind: 'reject', userId: 'user_test' }), DraftValidationError);
});

test('failed approval changes neither draft nor email', async () => {
  const { tenantId, emailId, draftId } = await fixture({ items: [] });
  await assert.rejects(mutations.mutateOwnedDraft(draftId, tenantId, { kind: 'approve', userId: 'user_test' }), DraftValidationError);
  const [draft] = await embedded.select().from(schema.faturasDraft).where(eq(schema.faturasDraft.id, draftId));
  const [email] = await embedded.select().from(schema.emails).where(eq(schema.emails.id, emailId));
  assert.equal(draft.status, 'pendente_revisao');
  assert.equal(draft.reviewedAt, null);
  assert.equal(email.status, 'extracted');
});

test('completed documents and active processing refuse all mutations', async () => {
  for (const overrides of [{ status: 'emissao_em_curso' }, { status: 'emitida_proforma' },
    { proformaNumero: 1 }, { moloniDocumentId: 1 }]) {
    const { tenantId, draftId } = await fixture(overrides);
    await assert.rejects(mutations.mutateOwnedDraft(draftId, tenantId,
      { kind: 'edit', data: { clienteNome: 'Changed' } }), DraftValidationError);
  }
  const { tenantId, draftId } = await fixture({}, 'processing');
  await assert.rejects(mutations.mutateOwnedDraft(draftId, tenantId,
    { kind: 'approve', userId: 'user_test' }), DraftValidationError);
});

test('emission snapshot refuses stale edits and processing claims', async () => {
  const { tenantId, draftId, emailId } = await fixture();
  const [snapshot] = await embedded.select().from(schema.faturasDraft).where(eq(schema.faturasDraft.id, draftId));
  await mutations.mutateOwnedDraft(draftId, tenantId, { kind: 'edit', data: { clienteNome: 'Novo' } });
  const stale = await embedded.update(schema.faturasDraft).set({ status: 'emissao_em_curso' })
    .where(and(eq(schema.faturasDraft.id, draftId), mutations.emissionSnapshotCondition(snapshot))).returning();
  assert.equal(stale.length, 0);
  const [current] = await embedded.select().from(schema.faturasDraft).where(eq(schema.faturasDraft.id, draftId));
  await embedded.update(schema.emails).set({ status: 'processing' }).where(eq(schema.emails.id, emailId));
  const active = await embedded.update(schema.faturasDraft).set({ status: 'emissao_em_curso' })
    .where(and(eq(schema.faturasDraft.id, draftId), mutations.emissionSnapshotCondition(current))).returning();
  assert.equal(active.length, 0);
});

test('Moloni never rounds an unsupported IVA rate into a supported one', () => {
  const settings = { documentSetId: 1, fallbackProductId: 1, taxIdsByRate: { 23: 1 } };
  assert.throws(() => mapDraftToInvoice({ items: [{ ...line, iva_percentagem: 22.9 }],
    prazoPagamento: null, observacoes: null }, 1, settings), /não suportada/);
});

test('provider errors shown to users do not include raw messages or credentials', () => {
  const error = new MoloniApiError('secret-canary', [{ field: 'apiKey', msg: 'secret-canary' }]);
  assert.ok(!safeMoloniError(error).includes('secret-canary'));
});

test('credential modules refuse loading outside the server environment', () => {
  for (const path of ['./lib/crypto.ts', './lib/db/index.ts', './lib/settings/company.ts', './lib/settings/environment.ts', './lib/settings/moloni.ts']) {
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `await import('${path}')`],
      { cwd: new URL('..', import.meta.url), env: { ...process.env, NODE_OPTIONS: '' }, encoding: 'utf8' });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /cannot be imported from a Client Component/);
  }
});
