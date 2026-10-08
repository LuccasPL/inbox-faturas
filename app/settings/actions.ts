'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { tenants } from '@/lib/db/schema';
import { encrypt, decrypt } from '@/lib/crypto';
import { getOrCreateTenantForUser, requireTenant } from '@/lib/auth/tenant';
import * as moloni from '@/lib/moloni/api';
import { MoloniApiError, safeMoloniError } from '@/lib/moloni/client';
import { normalizeIban, isValidIbanPt } from '@/lib/validation/iban-pt';
import { isValidNifPt, normalizeNifPt } from '@/lib/validation/nif-pt';
import { RATE_LIMITS } from '@/lib/security/policies';
import { ActionRateLimitError, requireActionRateLimit } from '@/lib/security/rate-limit';
import type { UserCompany, DocumentSet } from '@/lib/moloni/types';
import { saveTenantProfile, SettingsValidationError } from '@/lib/settings/company';
import { isPositiveId } from '@/lib/settings/readiness';
import { inspectMoloniConnection, loadOwnedMoloniOptions, publicMoloniCompanies, validateMoloniDefaults, validateMoloniOptions, type CompanyOptions, type MoloniDefaults } from '@/lib/settings/moloni';
export type { CompanyOptions } from '@/lib/settings/moloni';

export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Guarda a API key (encriptada) e devolve a lista de empresas que ela
 * dá acesso (via me query). O user escolhe a seguir qual empresa usar.
 */
export async function saveApiKey(
  apiKey: string,
): Promise<ActionResult<UserCompany[]>> {
  try {
    const tenant = await getOrCreateTenantForUser();
    await requireActionRateLimit(tenant.id, RATE_LIMITS.moloniSetup);
    if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.trim().length > 4096) {
      throw new SettingsValidationError('API key vazia ou demasiado longa.');
    }
    const trimmed = apiKey.trim();
    const meData = await moloni.me(trimmed);
    const companies = publicMoloniCompanies(meData.userCompanies);
    await db
      .update(tenants)
      .set({ moloniApiKeyEnc: encrypt(trimmed), moloniCompanyId: null,
        moloniDefaultDocType: null, moloniDefaultDocSetId: null, moloniFallbackProductId: null,
        moloniTaxId23: null, moloniTaxId13: null, moloniTaxId6: null, moloniTaxId0: null })
      .where(eq(tenants.id, tenant.id));

    revalidatePath('/settings');
    return { ok: true, data: companies };
  } catch (err) {
    return { ok: false, error: formatError(err) };
  }
}

/**
 * Depois de saveApiKey: user escolheu a empresa. Guarda companyId e
 * devolve as opções (document sets, document types, products) para os
 * dropdowns finais.
 */
export async function saveCompanyAndLoadOptions(
  companyId: number,
): Promise<ActionResult<CompanyOptions>> {
  try {
    const tenant = await getOrCreateTenantForUser();
    await requireActionRateLimit(tenant.id, RATE_LIMITS.moloniSetup);
    if (!tenant.moloniApiKeyEnc) throw new SettingsValidationError('Moloni não configurado.');
    const { options } = await loadOwnedMoloniOptions(decrypt(tenant.moloniApiKeyEnc), companyId);

    const changed = await db
      .update(tenants)
      .set({ moloniCompanyId: companyId, moloniDefaultDocType: null, moloniDefaultDocSetId: null,
        moloniFallbackProductId: null, moloniTaxId23: null, moloniTaxId13: null, moloniTaxId6: null, moloniTaxId0: null })
      .where(and(eq(tenants.id, tenant.id), eq(tenants.moloniApiKeyEnc, tenant.moloniApiKeyEnc)))
      .returning({ id: tenants.id });
    if (!changed.length) throw new SettingsValidationError('A ligação mudou. Atualiza a página.');

    revalidatePath('/settings');
    return {
      ok: true,
      data: options,
    };
  } catch (err) {
    return { ok: false, error: formatError(err) };
  }
}

/**
 * Refaz a query de document sets para um tipo de documento específico.
 * Útil quando o user troca o "tipo de documento" no dropdown.
 */
export async function loadDocumentSetsForType(
  documentTypeId: number,
): Promise<ActionResult<DocumentSet[]>> {
  try {
    const tenant = await getOrCreateTenantForUser();
    await requireActionRateLimit(tenant.id, RATE_LIMITS.moloniSetup);
    if (!tenant.moloniCompanyId || !tenant.moloniApiKeyEnc) {
      return { ok: false, error: 'Empresa Moloni não definida' };
    }
    if (documentTypeId !== 1) throw new SettingsValidationError('Neste momento a app só suporta Fatura no Moloni.');
    const { options } = await loadOwnedMoloniOptions(decrypt(tenant.moloniApiKeyEnc), tenant.moloniCompanyId);
    return { ok: true, data: options.documentSets };
  } catch (err) {
    return { ok: false, error: formatError(err) };
  }
}

/**
 * Grava as escolhas finais: tipo de documento, série e produto fallback.
 */
export async function saveDefaults(input: MoloniDefaults): Promise<ActionResult> {
  try {
    const tenant = await getOrCreateTenantForUser();
    await requireActionRateLimit(tenant.id, RATE_LIMITS.moloniSetup);
    validateMoloniDefaults(input);
    if (!tenant.moloniApiKeyEnc || !isPositiveId(tenant.moloniCompanyId)) throw new SettingsValidationError('Empresa Moloni não definida.');
    const { options } = await loadOwnedMoloniOptions(decrypt(tenant.moloniApiKeyEnc), tenant.moloniCompanyId);
    validateMoloniOptions(input, options);
    const changed = await db
      .update(tenants)
      .set({
        moloniDefaultDocType: input.documentTypeId,
        moloniDefaultDocSetId: input.documentSetId,
        moloniFallbackProductId: input.fallbackProductId,
        moloniTaxId23: input.taxId23,
        moloniTaxId13: input.taxId13,
        moloniTaxId6: input.taxId6,
        moloniTaxId0: input.taxId0,
      })
      .where(and(eq(tenants.id, tenant.id), eq(tenants.moloniCompanyId, tenant.moloniCompanyId),
        eq(tenants.moloniApiKeyEnc, tenant.moloniApiKeyEnc))).returning({ id: tenants.id });
    if (!changed.length) throw new SettingsValidationError('A ligação mudou. Atualiza a página.');
    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: formatError(err) };
  }
}

/**
 * Atualiza o modo de emissão (Moloni vs Proforma PDF) e dados da empresa
 * emitente para o PDF.
 */
export async function atualizarEmissao(input: {
  via: 'moloni' | 'pdf_proforma';
  empresaNif: string | null;
  empresaMorada: string | null;
  empresaIban: string | null;
}): Promise<ActionResult> {
  if (!input || !['moloni', 'pdf_proforma'].includes(input.via) ||
    [input.empresaNif, input.empresaMorada, input.empresaIban].some(value => value !== null && typeof value !== 'string') ||
    (input.empresaMorada?.length ?? 0) > 1000 || (input.empresaNif?.length ?? 0) > 40 || (input.empresaIban?.length ?? 0) > 80) {
    return { ok: false, error: 'Dados de emissão inválidos.' };
  }
  const empresaNif = input.empresaNif ? normalizeNifPt(input.empresaNif) : null;
  const empresaMorada = input.empresaMorada?.trim() || null;
  const empresaIban = input.empresaIban ? normalizeIban(input.empresaIban) : null;

  if (empresaNif && !isValidNifPt(empresaNif)) {
    return { ok: false, error: 'NIF do emitente em formato inválido' };
  }
  if (empresaIban && !isValidIbanPt(empresaIban)) {
    return { ok: false, error: 'IBAN do emitente em formato inválido' };
  }

  try {
    const tenant = await getOrCreateTenantForUser();
    await requireActionRateLimit(tenant.id, RATE_LIMITS.mutation);
    await db
      .update(tenants)
      .set({
        emissaoVia: input.via,
        empresaNif,
        empresaMorada,
        empresaIban,
      })
      .where(eq(tenants.id, tenant.id));
    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: formatError(err) };
  }
}

/**
 * Atualiza o nome. Endereços são atribuídos e autorizados administrativamente.
 */
export async function atualizarTenant(input: {
  nome: string;
  emailInbound?: string;
}): Promise<ActionResult> {
  try {
    const tenant = await getOrCreateTenantForUser();
    await requireActionRateLimit(tenant.id, RATE_LIMITS.mutation);
    await saveTenantProfile(tenant.id, input);
    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: formatError(err) };
  }
}

export async function atualizarNotificacoes(input: {
  enabled: boolean;
  email: string | null;
}): Promise<ActionResult> {
  if (!input || typeof input.enabled !== 'boolean' || (input.email !== null && typeof input.email !== 'string') ||
    (input.email?.length ?? 0) > 254) return { ok: false, error: 'Dados de alertas inválidos.' };
  const email = input.email?.trim().toLowerCase() || null;

  if (input.enabled && !email) {
    return { ok: false, error: 'Define um email para receber os alertas' };
  }
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, error: 'Email de alertas em formato inválido' };
  }

  try {
    const tenant = await getOrCreateTenantForUser();
    await requireActionRateLimit(tenant.id, RATE_LIMITS.mutation);
    await db
      .update(tenants)
      .set({
        notifEnabled: input.enabled,
        notifEmail: email,
      })
      .where(eq(tenants.id, tenant.id));
    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: formatError(err) };
  }
}

/**
 * Desliga: apaga todas as credenciais Moloni do tenant.
 */
export async function disconnectMoloni(): Promise<ActionResult> {
  try {
    const tenant = await getOrCreateTenantForUser();
    await requireActionRateLimit(tenant.id, RATE_LIMITS.mutation);
    await db
      .update(tenants)
      .set({
        moloniApiKeyEnc: null,
        moloniCompanyId: null,
        moloniDefaultDocSetId: null,
        moloniDefaultDocType: null,
        moloniFallbackProductId: null,
        moloniTaxId23: null,
        moloniTaxId13: null,
        moloniTaxId6: null,
        moloniTaxId0: null,
      })
      .where(eq(tenants.id, tenant.id));
    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: formatError(err) };
  }
}

/* -------------------------------------------------------------------------- */

export async function verifyMoloniConnection(): Promise<ActionResult<{
  companies: UserCompany[]; options: CompanyOptions | null; checkedAt: string;
}>> {
  try {
    const tenant = await requireTenant();
    await requireActionRateLimit(tenant.id, RATE_LIMITS.moloniSetup);
    return { ok: true, data: await inspectMoloniConnection(tenant) };
  } catch (err) {
    return { ok: false, error: formatError(err) };
  }
}

function formatError(err: unknown): string {
  if (err instanceof SettingsValidationError) return err.message;
  if (err instanceof MoloniApiError) return safeMoloniError(err);
  if (err instanceof ActionRateLimitError) return err.message;
  console.error('[settings] Não foi possível guardar a configuração.');
  return 'Não foi possível concluir a operação. Tenta novamente mais tarde.';
}
