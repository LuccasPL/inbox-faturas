import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { before, after, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from '../lib/db/schema.ts';
import { isInboundAuthorized } from '../lib/settings/inbound-policy.ts';
import { buildSettingsReadiness, hasMoloniSetup } from '../lib/settings/readiness.ts';
import { encrypt } from '../lib/crypto.ts';

process.env.DATABASE_URL = 'postgres://settings_test:settings_test@127.0.0.1:1/settings_test';
process.env.APP_ENC_KEY = '0'.repeat(64);
process.env.POSTMARK_WEBHOOK_USER = 'synthetic-user';
process.env.POSTMARK_WEBHOOK_PASSWORD = 'synthetic-password';
process.env.ANTHROPIC_API_KEY = 'synthetic-ai-key';
process.env.POSTMARK_OUTBOUND_TOKEN = 'synthetic-outbound-key';
let database, embedded, company, moloni, environment, webhook;
let calls = [], onQuery = null;
const privateCanary = 'private-settings-canary-not-a-real-key';
const options = {
  documentTypes: [{ documentTypeId: 1, name: 'Fatura', code: 'FT', private: privateCanary }],
  documentSets: [{ documentSetId: 10, name: 'Série teste', isDefault: true, private: privateCanary }],
  products: [{ productId: 20, name: 'Serviço', reference: null, price: 10, private: privateCanary }],
  taxes: [23, 13, 6, 0].map((rate, index) => ({ taxId: 30 + index, name: `IVA ${rate}`, value: rate, type: 1, private: privateCanary })),
};
const defaults = { documentTypeId: 1, documentSetId: 10, fallbackProductId: 20, taxId23: 30, taxId13: 31, taxId6: 32, taxId0: 33 };
const env = { inboundAuth: true, ai: true, outbound: false, encryption: true };
const tenantProfile = () => ({ nome: 'Empresa fictícia', emailInbound: 'pedidos@example.com',
  emailInboundAuthorizedAddress: 'pedidos@example.com', emailInboundAuthorizedAt: new Date(),
  emissaoVia: 'pdf_proforma', empresaNif: '999999990', empresaMorada: 'Rua fictícia, Lisboa', empresaIban: null,
  moloniApiKeyEnc: null, moloniCompanyId: null, moloniDefaultDocType: null, moloniDefaultDocSetId: null,
  moloniFallbackProductId: null, moloniTaxId23: null, notifEnabled: false, notifEmail: null });
const states = items => Object.fromEntries(items.map(item => [item.id, item]));

before(async () => {
  database = new PGlite(); embedded = drizzle(database, { schema });
  const directory = new URL('../drizzle/', import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    await database.exec(await readFile(new URL(name, directory), 'utf8'));
  }
  const { db } = await import('../lib/db/index.ts');
  for (const method of ['select', 'transaction']) mock.method(db, method, embedded[method].bind(embedded));
  for (const method of ['insert', 'update', 'delete']) mock.method(db, method, () => { throw new Error('Unexpected direct write in read-only checks'); });
  mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.molonion.pt/v1');
    assert.equal(init.method, 'POST');
    const { query, variables } = JSON.parse(init.body);
    assert.ok(!query.includes('mutation'), 'Diagnostics must never emit or modify provider data');
    const field = ['documentSetsForDocument', 'documentTypes', 'products', 'taxes', 'me'].find(name => query.includes(name + '(') || query.includes(name + ' {'));
    assert.ok(field, query); calls.push({ field, variables });
    if (onQuery) await onQuery(field);
    const data = field === 'me' ? { userId: 1, email: 'private@example.com', private: privateCanary,
      userCompanies: [{ companyId: 1, name: 'Empresa fictícia', isOwner: true, slug: null, private: privateCanary }] }
      : field === 'documentSetsForDocument' ? options.documentSets : options[field];
    return new Response(JSON.stringify({ data: { [field]: { errors: [], data } } }), { headers: { 'content-type': 'application/json' } });
  });
  company = await import('../lib/settings/company.ts');
  moloni = await import('../lib/settings/moloni.ts');
  environment = await import('../lib/settings/environment.ts');
  webhook = await import('../app/api/webhooks/postmark/route.ts');
});

after(async () => { mock.restoreAll(); if (database) await database.close(); });

async function fixture(values = {}) {
  const id = randomUUID();
  const [tenant] = await embedded.insert(schema.tenants).values({ id, nome: 'Empresa fictícia', emailInbound: `${id}@example.com`, ...values }).returning();
  return tenant;
}

test('inbound authorization requires an exact real address and an administrative timestamp', () => {
  const tenant = tenantProfile(); assert.ok(isInboundAuthorized(tenant));
  for (const change of [{ emailInboundAuthorizedAt: null }, { emailInboundAuthorizedAt: new Date('invalid') },
    { emailInboundAuthorizedAddress: 'other@example.com' }, { emailInbound: 'pedidos@pending.invalid' },
    { emailInbound: ' PEDIDOS@example.com ' }, { emailInboundAuthorizedAt: new Date().toISOString() }]) {
    assert.equal(isInboundAuthorized({ ...tenant, ...change }), false);
  }
});

test('SQL does not automatically authorize existing or newly created companies and is repeatable', async () => {
  const legacy = new PGlite();
  try {
    await legacy.exec("create table tenants(id uuid primary key, email_inbound text not null); insert into tenants values(gen_random_uuid(), 'legacy@example.com')");
    await legacy.exec(await readFile(new URL('../drizzle/0010_inbound_authorization.sql', import.meta.url), 'utf8'));
    assert.deepEqual((await legacy.query('select email_inbound, email_inbound_authorized_address, email_inbound_authorized_at from tenants')).rows,
      [{ email_inbound: 'legacy@example.com', email_inbound_authorized_address: null, email_inbound_authorized_at: null }]);
  } finally { await legacy.close(); }
  const tenant = await fixture();
  assert.equal(await company.findAuthorizedInboundTenant(tenant.emailInbound), null);
  const stamp = new Date();
  await embedded.update(schema.tenants).set({ emailInboundAuthorizedAddress: tenant.emailInbound, emailInboundAuthorizedAt: stamp }).where(eq(schema.tenants.id, tenant.id));
  const sql = await readFile(new URL('../drizzle/0010_inbound_authorization.sql', import.meta.url), 'utf8');
  await database.exec(sql); await database.exec(sql);
  const approved = await company.findAuthorizedInboundTenant(tenant.emailInbound);
  assert.equal(approved.id, tenant.id); assert.equal(approved.emailInboundAuthorizedAt.toISOString(), stamp.toISOString());
});

test('changing or revoking the administrative binding immediately prevents future resolution', async () => {
  const tenant = await fixture();
  await embedded.update(schema.tenants).set({ emailInboundAuthorizedAddress: tenant.emailInbound, emailInboundAuthorizedAt: new Date() }).where(eq(schema.tenants.id, tenant.id));
  assert.equal((await company.findAuthorizedInboundTenant(tenant.emailInbound)).id, tenant.id);
  const changed = `changed-${tenant.id}@example.com`;
  await embedded.update(schema.tenants).set({ emailInbound: changed }).where(eq(schema.tenants.id, tenant.id));
  assert.equal(await company.findAuthorizedInboundTenant(changed), null);
  assert.equal(await company.findAuthorizedInboundTenant(tenant.emailInbound), null);
  await embedded.update(schema.tenants).set({ emailInbound: tenant.emailInbound, emailInboundAuthorizedAt: null }).where(eq(schema.tenants.id, tenant.id));
  assert.equal(await company.findAuthorizedInboundTenant(tenant.emailInbound), null);
});

test('profile updates cannot change reception addresses or grant administrative approval', async () => {
  const tenant = await fixture(), other = await fixture();
  await assert.rejects(company.saveTenantProfile(tenant.id, { nome: 'Alterado', emailInbound: other.emailInbound }), company.SettingsValidationError);
  await company.saveTenantProfile(tenant.id, { nome: 'Nome novo', emailInboundAuthorizedAddress: tenant.emailInbound, emailInboundAuthorizedAt: new Date() });
  const [current] = await embedded.select().from(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  assert.equal(current.nome, 'Nome novo'); assert.equal(current.emailInbound, tenant.emailInbound);
  assert.equal(current.emailInboundAuthorizedAddress, null); assert.equal(current.emailInboundAuthorizedAt, null);
  assert.equal((await embedded.select().from(schema.tenants).where(eq(schema.tenants.id, other.id)))[0].nome, other.nome);
});

test('old clients can save the same address but malformed profile input is refused', async () => {
  const tenant = await fixture();
  await company.saveTenantProfile(tenant.id, { nome: ' Nome ', emailInbound: tenant.emailInbound.toUpperCase() });
  for (const input of [null, {}, { nome: 3 }, { nome: ' ' }, { nome: 'x'.repeat(161) }, { nome: 'Nome', emailInbound: 12 }]) {
    await assert.rejects(company.saveTenantProfile(tenant.id, input), company.SettingsValidationError);
  }
  await assert.rejects(company.saveTenantProfile(randomUUID(), { nome: 'Nome' }), company.SettingsValidationError);
});

test('webhook refuses unknown or unapproved recipients before writes, AI or provider calls', async () => {
  const tenant = await fixture();
  const previous = calls.length;
  for (const recipient of [tenant.emailInbound, 'unknown@example.com']) {
    const request = new Request('http://localhost/api/webhooks/postmark', { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Basic ' + Buffer.from('synthetic-user:synthetic-password').toString('base64') },
      body: JSON.stringify({ From: 'client@example.com', OriginalRecipient: recipient, MessageID: randomUUID(), TextBody: 'Teste' }) });
    const response = await webhook.POST(request);
    assert.equal(response.status, 503); assert.equal(response.headers.get('retry-after'), '60');
    assert.deepEqual(await response.json(), { ok: false, error: 'recipient unavailable' });
  }
  assert.equal(calls.length, previous);
  assert.equal((await embedded.select().from(schema.emails)).length, 0);
});

test('PDF diagnostics distinguish authorization, optional Moloni and optional sending', () => {
  const result = states(buildSettingsReadiness(tenantProfile(), env));
  assert.equal(result.inbound.value, 'Autorizado'); assert.equal(result.pdf.state, 'configured');
  assert.equal(result.moloni.state, 'optional'); assert.equal(result.outbound.state, 'optional');
  assert.equal(result.notifications.state, 'disabled');
  assert.ok(!Object.values(result).some(row => /Pronto para emitir|Ligação verificada/.test(row.value)));
});

test('unauthorized notification senders are refused before an outbound request', async () => {
  const { notifyRelevantInboundEmail } = await import('../lib/email/relevant-request-notification.ts');
  const previous = calls.length;
  await notifyRelevantInboundEmail({ tenant: { ...tenantProfile(), notifEnabled: true, notifEmail: 'ops@example.com', emailInboundAuthorizedAt: null },
    email: { id: randomUUID(), fromEmail: 'client@example.com', subject: 'Teste' }, triagem: { isFaturaRequest: 'sim', confianca: 'alta', motivo: 'Teste' } });
  assert.equal(calls.length, previous);
  assert.equal(states(buildSettingsReadiness({ ...tenantProfile(), notifEnabled: true, notifEmail: 'invalid' }, { ...env, outbound: true })).notifications.state, 'missing');
});

test('Moloni completeness includes supported type, encryption and the required IVA mapping', () => {
  const tenant = { ...tenantProfile(), emissaoVia: 'moloni', moloniApiKeyEnc: privateCanary, moloniCompanyId: 1,
    moloniDefaultDocType: 1, moloniDefaultDocSetId: 10, moloniFallbackProductId: 20, moloniTaxId23: 30 };
  assert.ok(hasMoloniSetup(tenant));
  for (const change of [{ moloniTaxId23: null }, { moloniDefaultDocType: 2 }, { moloniCompanyId: -1 }, { moloniFallbackProductId: 1.5 }]) {
    assert.equal(hasMoloniSetup({ ...tenant, ...change }), false);
  }
  assert.equal(states(buildSettingsReadiness(tenant, { ...env, encryption: false })).moloni.state, 'missing');
  assert.equal(states(buildSettingsReadiness(tenant, env)).moloni.state, 'configured');
});

test('diagnostics report absent server configuration without serializing its secret values', () => {
  const result = states(buildSettingsReadiness({ ...tenantProfile(), moloniApiKeyEnc: privateCanary, notifEnabled: true, notifEmail: 'ops@example.com' },
    { inboundAuth: false, ai: false, outbound: false, encryption: false }));
  assert.equal(result.webhook.state, 'missing'); assert.equal(result.ai.state, 'missing'); assert.equal(result.notifications.state, 'missing');
  const serialized = JSON.stringify(result); assert.ok(!serialized.includes(privateCanary));
  const server = environment.settingsEnvironment(); assert.ok(Object.values(server).every(value => typeof value === 'boolean'));
  assert.ok(!JSON.stringify(server).includes('synthetic-password'));
  const encrypted = encrypt(privateCanary);
  const corrupted = environment.settingsReadiness({ ...tenantProfile(), emissaoVia: 'moloni', moloniApiKeyEnc: encrypted + 'corrupted' });
  assert.equal(states(corrupted).moloni.state, 'missing');
});

test('Moloni ownership is checked before requesting options from another company', async () => {
  calls = [];
  await assert.rejects(moloni.loadOwnedMoloniOptions(privateCanary, 2), company.SettingsValidationError);
  assert.deepEqual(calls.map(call => call.field), ['me']);
  for (const id of [0, -1, 1.5, '1', NaN, Infinity, 2_147_483_648]) {
    await assert.rejects(moloni.loadOwnedMoloniOptions(privateCanary, id), company.SettingsValidationError);
  }
  assert.deepEqual(calls.map(call => call.field), ['me']);
});

test('Moloni options contain only the required public fields and no raw private provider data', async () => {
  const result = await moloni.loadOwnedMoloniOptions(privateCanary, 1);
  assert.equal(result.companies[0].companyId, 1); assert.equal(result.options.products[0].productId, 20);
  assert.ok(!JSON.stringify(result).includes(privateCanary)); assert.ok(!JSON.stringify(result).includes('private@example.com'));
  assert.throws(() => moloni.publicMoloniCompanies(null), company.SettingsValidationError);
});

test('Moloni defaults reject fabricated IDs, wrong rates and unsupported types', () => {
  moloni.validateMoloniOptions(defaults, options);
  for (const change of [{ documentTypeId: 2 }, { documentSetId: -10 }, { documentSetId: 99 }, { fallbackProductId: 99 },
    { taxId23: null }, { taxId23: 31 }, { taxId13: 30 }, { taxId6: undefined }, { taxId0: '33' }]) {
    assert.throws(() => moloni.validateMoloniOptions({ ...defaults, ...change }, options), company.SettingsValidationError);
  }
  assert.throws(() => moloni.validateMoloniDefaults(null), company.SettingsValidationError);
});

test('explicit connection diagnostics only read data and never change the saved configuration', async () => {
  const tenant = await fixture({ moloniApiKeyEnc: encrypt(privateCanary), moloniCompanyId: 1 });
  calls = []; const result = await moloni.inspectMoloniConnection(tenant);
  assert.ok(Number.isFinite(Date.parse(result.checkedAt))); assert.ok(!JSON.stringify(result).includes(privateCanary));
  assert.equal(calls.length, 5);
  assert.deepEqual((await embedded.select().from(schema.tenants).where(eq(schema.tenants.id, tenant.id)))[0], tenant);
  const noCompany = await fixture({ moloniApiKeyEnc: encrypt(privateCanary) });
  calls = []; assert.equal((await moloni.inspectMoloniConnection(noCompany)).options, null); assert.equal(calls.length, 1);
});

test('a stale check cannot declare a disconnected or changed Moloni configuration verified', async () => {
  const tenant = await fixture({ moloniApiKeyEnc: encrypt(privateCanary), moloniCompanyId: 1 });
  onQuery = async field => { if (field === 'me') await embedded.update(schema.tenants).set({ moloniApiKeyEnc: null }).where(eq(schema.tenants.id, tenant.id)); };
  try { await assert.rejects(moloni.inspectMoloniConnection(tenant), company.SettingsValidationError); }
  finally { onQuery = null; }
});
