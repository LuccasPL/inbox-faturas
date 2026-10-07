import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { before, after, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '../lib/db/schema.ts';

process.env.DATABASE_URL = 'postgres://lifecycle_test:lifecycle_test@127.0.0.1:1/lifecycle_test';
let database, embedded, processing, migrations;

before(async () => {
  database = new PGlite();
  embedded = drizzle(database, { schema });
  const directory = new URL('../drizzle/', import.meta.url);
  migrations = await Promise.all((await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort()
    .map((name) => readFile(new URL(name, directory), 'utf8')));
  for (const sql of migrations) await database.exec(sql);
  const { db } = await import('../lib/db/index.ts');
  mock.method(db, 'transaction', embedded.transaction.bind(embedded));
  processing = await import('../lib/extraction/processing.ts');
});

after(async () => {
  mock.restoreAll();
  if (database) await database.close();
});

async function fixture(draftValues = null, emailStatus = 'ignored') {
  const tenantId = randomUUID(), emailId = randomUUID();
  await embedded.insert(schema.tenants).values({ id: tenantId, nome: 'Teste', emailInbound: `${tenantId}@example.com` });
  await embedded.insert(schema.emails).values({ id: emailId, tenantId, status: emailStatus,
    fromEmail: 'client@example.com', toEmail: 'inbound@example.com', rawPayload: {} });
  if (draftValues) await embedded.insert(schema.faturasDraft).values({ emailId, tenantId, ...draftValues });
  return { emailId, tenantId };
}

test('all manual SQL scripts initialize a fresh database and match every schema column', async () => {
  assert.equal(migrations.length, 9);
  for (const table of [schema.tenants, schema.emails, schema.faturasDraft, schema.securityRateLimits]) {
    const config = getTableConfig(table);
    const { rows } = await database.query('select column_name from information_schema.columns where table_schema = $1 and table_name = $2',
      ['public', config.name]);
    assert.deepEqual(rows.map((row) => row.column_name).sort(), config.columns.map((column) => column.name).sort());
  }
  for (const sql of migrations) await database.exec(sql);
  await database.query('select processing_token, processing_started_at from emails limit 0');
});

test('deleting an unprotected email removes its pending draft through the real cascade', async () => {
  const { emailId, tenantId } = await fixture({ status: 'pendente_revisao' });
  await processing.deleteEmailSafely(emailId, tenantId);
  assert.equal((await embedded.select().from(schema.emails).where(eq(schema.emails.id, emailId))).length, 0);
  assert.equal((await embedded.select().from(schema.faturasDraft).where(eq(schema.faturasDraft.emailId, emailId))).length, 0);
});

test('approved, emitted and uncertain documents cannot be deleted even if email status is stale', async () => {
  for (const values of [{ status: 'aprovado' }, { status: 'emitida' }, { status: 'rascunho_moloni' },
    { status: 'emissao_em_curso' }, { status: 'emitida_proforma' },
    { status: 'falha_emissao', moloniDocumentId: 1 }, { status: 'falha_emissao', proformaNumero: 1 }]) {
    const { emailId, tenantId } = await fixture(values);
    await assert.rejects(processing.deleteEmailSafely(emailId, tenantId), processing.EmailDeletionError);
    assert.equal((await embedded.select().from(schema.emails).where(eq(schema.emails.id, emailId))).length, 1);
    assert.equal((await embedded.select().from(schema.faturasDraft).where(eq(schema.faturasDraft.emailId, emailId))).length, 1);
  }
});

test('processing and completed email statuses remain protected even without a draft', async () => {
  for (const status of ['processing', 'approved', 'emitted', 'draft_moloni', 'emitted_proforma']) {
    const { emailId, tenantId } = await fixture(null, status);
    await assert.rejects(processing.deleteEmailSafely(emailId, tenantId), processing.EmailDeletionError);
  }
});

test('deletion checks every draft and the authenticated tenant', async () => {
  const { emailId, tenantId } = await fixture({ status: 'pendente_revisao' });
  await assert.rejects(processing.deleteEmailSafely(emailId, randomUUID()), processing.EmailDeletionError);
  await embedded.insert(schema.faturasDraft).values({ emailId, tenantId, status: 'aprovado' });
  await assert.rejects(processing.deleteEmailSafely(emailId, tenantId), processing.EmailDeletionError);
  assert.equal((await embedded.select().from(schema.faturasDraft).where(eq(schema.faturasDraft.emailId, emailId))).length, 2);
});

test('inconsistent tenant associations cannot be erased by cascading deletion', async () => {
  const { emailId, tenantId } = await fixture();
  const other = await fixture();
  await embedded.insert(schema.faturasDraft).values({ emailId, tenantId: other.tenantId, status: 'pendente_revisao' });
  await assert.rejects(processing.deleteEmailSafely(emailId, tenantId), processing.EmailDeletionError);
  assert.equal((await embedded.select().from(schema.faturasDraft).where(eq(schema.faturasDraft.emailId, emailId))).length, 1);
});

test('ignored noise and rejected drafts remain removable', async () => {
  for (const values of [null, { status: 'rejeitado' }]) {
    const { emailId, tenantId } = await fixture(values);
    await processing.deleteEmailSafely(emailId, tenantId);
    assert.equal((await embedded.select().from(schema.emails).where(eq(schema.emails.id, emailId))).length, 0);
  }
});
