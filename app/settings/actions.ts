'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { tenants } from '@/lib/db/schema';
import { encrypt, decrypt } from '@/lib/crypto';
import { getOrCreateTenantForUser } from '@/lib/auth/tenant';
import * as moloni from '@/lib/moloni/api';
import { MoloniApiError } from '@/lib/moloni/client';
import type {
  UserCompany,
  DocumentSet,
  DocumentType,
  Product,
  Tax,
} from '@/lib/moloni/types';

export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * Guarda a API key (encriptada) e devolve a lista de empresas que ela
 * dá acesso (via me query). O user escolhe a seguir qual empresa usar.
 */
export async function saveApiKey(
  apiKey: string,
): Promise<ActionResult<UserCompany[]>> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return { ok: false, error: 'API key vazia' };
  }

  try {
    const meData = await moloni.me(trimmed);

    const tenant = await getOrCreateTenantForUser();
    await db
      .update(tenants)
      .set({ moloniApiKeyEnc: encrypt(trimmed) })
      .where(eq(tenants.id, tenant.id));

    revalidatePath('/settings');
    return { ok: true, data: meData.userCompanies };
  } catch (err) {
    return { ok: false, error: formatError(err) };
  }
}

/**
 * Depois de saveApiKey: user escolheu a empresa. Guarda companyId e
 * devolve as opções (document sets, document types, products) para os
 * dropdowns finais.
 */
export interface CompanyOptions {
  documentTypes: DocumentType[];
  // por defeito devolvemos os document sets para Fatura (typeId=1).
  // Se o user mudar o tipo de documento, refaz a chamada.
  documentSets: DocumentSet[];
  products: Product[];
  taxes: Tax[];
}

export async function saveCompanyAndLoadOptions(
  companyId: number,
): Promise<ActionResult<CompanyOptions>> {
  try {
    const tenant = await getOrCreateTenantForUser();
    const apiKey = await getApiKeyOrThrow(tenant.id);

    await db
      .update(tenants)
      .set({ moloniCompanyId: companyId })
      .where(eq(tenants.id, tenant.id));

    const [types, sets, prods, taxesList] = await Promise.all([
      moloni.documentTypes(apiKey, companyId),
      moloni.documentSetsForDocument(apiKey, companyId, 1),
      moloni.products(apiKey, companyId),
      moloni.taxes(apiKey, companyId),
    ]);

    revalidatePath('/settings');
    return {
      ok: true,
      data: {
        documentTypes: types,
        documentSets: sets,
        products: prods,
        taxes: taxesList,
      },
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
    if (!tenant.moloniCompanyId) {
      return { ok: false, error: 'Empresa Moloni não definida' };
    }
    const apiKey = await getApiKeyOrThrow(tenant.id);
    const sets = await moloni.documentSetsForDocument(
      apiKey,
      tenant.moloniCompanyId,
      documentTypeId,
    );
    return { ok: true, data: sets };
  } catch (err) {
    return { ok: false, error: formatError(err) };
  }
}

/**
 * Grava as escolhas finais: tipo de documento, série e produto fallback.
 */
export async function saveDefaults(input: {
  documentTypeId: number;
  documentSetId: number;
  fallbackProductId: number;
  taxId23: number | null;
  taxId13: number | null;
  taxId6: number | null;
  taxId0: number | null;
}): Promise<ActionResult> {
  if (input.documentTypeId !== 1) {
    return {
      ok: false,
      error: 'Neste momento a app só suporta Fatura no Moloni.',
    };
  }
  if (!input.taxId23) {
    return {
      ok: false,
      error: 'Define pelo menos o taxId para IVA 23% (taxa default em PT).',
    };
  }

  try {
    const tenant = await getOrCreateTenantForUser();
    await db
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
      .where(eq(tenants.id, tenant.id));
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
  try {
    const tenant = await getOrCreateTenantForUser();
    await db
      .update(tenants)
      .set({
        emissaoVia: input.via,
        empresaNif: input.empresaNif?.trim() || null,
        empresaMorada: input.empresaMorada?.trim() || null,
        empresaIban: input.empresaIban?.replace(/\s+/g, '') || null,
      })
      .where(eq(tenants.id, tenant.id));
    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: formatError(err) };
  }
}

/**
 * Atualiza dados gerais do tenant (nome e endereço inbound).
 * Devolve erro amigável se o emailInbound entrar em conflito com outro tenant.
 */
export async function atualizarTenant(input: {
  nome: string;
  emailInbound: string;
}): Promise<ActionResult> {
  const nome = input.nome.trim();
  const emailInbound = input.emailInbound.trim().toLowerCase();

  if (!nome) return { ok: false, error: 'Nome obrigatório' };
  if (!emailInbound) return { ok: false, error: 'Email inbound obrigatório' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInbound)) {
    return { ok: false, error: 'Email inbound em formato inválido' };
  }

  try {
    const tenant = await getOrCreateTenantForUser();
    await db
      .update(tenants)
      .set({ nome, emailInbound })
      .where(eq(tenants.id, tenant.id));
    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return {
        ok: false,
        error: 'Este email inbound já está a ser usado por outro tenant',
      };
    }
    return { ok: false, error: formatError(err) };
  }
}

/**
 * Desliga: apaga todas as credenciais Moloni do tenant.
 */
export async function disconnectMoloni(): Promise<ActionResult> {
  try {
    const tenant = await getOrCreateTenantForUser();
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

async function getApiKeyOrThrow(tenantId: string): Promise<string> {
  const [t] = await db
    .select({ enc: tenants.moloniApiKeyEnc })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!t?.enc) throw new Error('API key Moloni não configurada');
  return decrypt(t.enc);
}

function formatError(err: unknown): string {
  if (err instanceof MoloniApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Erro desconhecido';
}
