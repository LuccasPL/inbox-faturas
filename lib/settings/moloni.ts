import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tenants } from '@/lib/db/schema';
import { decrypt } from '@/lib/crypto';
import * as moloni from '@/lib/moloni/api';
import type { DocumentSet, DocumentType, Product, Tax, UserCompany } from '@/lib/moloni/types';
import { isPositiveId } from './readiness';
import { SettingsValidationError } from './company';

export interface CompanyOptions { documentTypes: DocumentType[]; documentSets: DocumentSet[]; products: Product[]; taxes: Tax[] }
export interface MoloniDefaults {
  documentTypeId: number; documentSetId: number; fallbackProductId: number;
  taxId23: number | null; taxId13: number | null; taxId6: number | null; taxId0: number | null;
}

export function publicMoloniCompanies(companies: UserCompany[]): UserCompany[] {
  if (!Array.isArray(companies) || companies.some(company => !company || !isPositiveId(company.companyId) || typeof company.name !== 'string')) {
    throw new SettingsValidationError('Não foi possível confirmar as empresas Moloni.');
  }
  return companies.map(company => ({ companyId: company.companyId, name: company.name,
    slug: typeof company.slug === 'string' ? company.slug : null, isOwner: company.isOwner === true }));
}

export async function loadOwnedMoloniOptions(apiKey: string, companyId: number) {
  if (!isPositiveId(companyId)) throw new SettingsValidationError('Empresa Moloni inválida.');
  const me = await moloni.me(apiKey);
  const companies = publicMoloniCompanies(me.userCompanies);
  if (!companies.some(company => company.companyId === companyId)) {
    throw new SettingsValidationError('Esta chave não tem acesso à empresa Moloni selecionada.');
  }
  const [documentTypes, documentSets, products, taxes] = await Promise.all([
    moloni.documentTypes(apiKey, companyId), moloni.documentSetsForDocument(apiKey, companyId, 1),
    moloni.products(apiKey, companyId), moloni.taxes(apiKey, companyId),
  ]);
  if (![documentTypes, documentSets, products, taxes].every(Array.isArray)) {
    throw new SettingsValidationError('Não foi possível confirmar as opções Moloni.');
  }
  return { companies, options: {
    documentTypes: documentTypes.map(type => ({ documentTypeId: type.documentTypeId, name: type.name, code: type.code })),
    documentSets: documentSets.map(set => ({ documentSetId: set.documentSetId, name: set.name, isDefault: set.isDefault })),
    products: products.map(product => ({ productId: product.productId, name: product.name, reference: product.reference, price: product.price })),
    taxes: taxes.map(tax => ({ taxId: tax.taxId, name: tax.name, value: tax.value, type: tax.type, isDefault: tax.isDefault })),
  } };
}

export function validateMoloniDefaults(input: MoloniDefaults): void {
  if (!input || input.documentTypeId !== 1 || !isPositiveId(input.documentSetId) || !isPositiveId(input.fallbackProductId) || !isPositiveId(input.taxId23)) {
    throw new SettingsValidationError('Define Fatura, série, produto e IVA 23% válidos.');
  }
  for (const taxId of [input.taxId13, input.taxId6, input.taxId0]) {
    if (taxId !== null && !isPositiveId(taxId)) throw new SettingsValidationError('ID de IVA inválido.');
  }
}

export function validateMoloniOptions(input: MoloniDefaults, options: CompanyOptions): void {
  validateMoloniDefaults(input);
  if (!options.documentTypes.some(type => type.documentTypeId === 1) ||
    !options.documentSets.some(set => set.documentSetId === input.documentSetId) ||
    !options.products.some(product => product.productId === input.fallbackProductId)) {
    throw new SettingsValidationError('Tipo, série ou produto não consta das opções carregadas desta empresa.');
  }
  for (const [rate, id] of [[23, input.taxId23], [13, input.taxId13], [6, input.taxId6], [0, input.taxId0]]) {
    if (id !== null && !options.taxes.some(tax => tax.taxId === id && Number(tax.value) === rate)) {
      throw new SettingsValidationError(`O mapeamento de IVA ${rate}% não corresponde às taxas desta empresa.`);
    }
  }
}

export async function inspectMoloniConnection(tenant: Pick<typeof tenants.$inferSelect, 'id' | 'moloniApiKeyEnc' | 'moloniCompanyId'>) {
  if (!tenant.moloniApiKeyEnc) throw new SettingsValidationError('Moloni não configurado.');
  const apiKey = decrypt(tenant.moloniApiKeyEnc);
  const data = tenant.moloniCompanyId
    ? await loadOwnedMoloniOptions(apiKey, tenant.moloniCompanyId)
    : { companies: publicMoloniCompanies((await moloni.me(apiKey)).userCompanies), options: null };
  const [current] = await db.select({ id: tenants.id }).from(tenants).where(and(
    eq(tenants.id, tenant.id), eq(tenants.moloniApiKeyEnc, tenant.moloniApiKeyEnc),
    tenant.moloniCompanyId === null ? sql`${tenants.moloniCompanyId} is null` : eq(tenants.moloniCompanyId, tenant.moloniCompanyId),
  )).limit(1);
  if (!current) throw new SettingsValidationError('A ligação mudou. Atualiza a página.');
  return { ...data, checkedAt: new Date().toISOString() };
}
