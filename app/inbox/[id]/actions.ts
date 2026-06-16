'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { faturasDraft, emails } from '@/lib/db/schema';
import { decrypt } from '@/lib/crypto';
import * as moloni from '@/lib/moloni/api';
import { MoloniApiError } from '@/lib/moloni/client';
import {
  mapDraftToInvoice,
  type DraftItem,
  type SupportedIvaRate,
} from '@/lib/moloni/map-draft-to-invoice';
import { requireDraftOwnership } from '@/lib/auth/tenant';
import { isValidNifPt } from '@/lib/validation/nif-pt';

interface DraftEditavel {
  clienteNome: string | null;
  clienteNif: string | null;
  clienteEmail: string | null;
  clienteMorada: string | null;
  items: Array<{
    descricao: string;
    quantidade: number;
    preco_unitario: number;
    iva_percentagem: number;
  }>;
  subtotal: number | null;
  ivaValor: number | null;
  total: number | null;
  iban: string | null;
  prazoPagamento: string | null;
  observacoes: string | null;
}

type DraftUpdate = Partial<typeof faturasDraft.$inferInsert>;

const EDITABLE_STATUSES = new Set(['pendente_revisao', 'falha_emissao']);

function assertDraftEditable(status: string | null): void {
  if (status && !EDITABLE_STATUSES.has(status)) {
    throw new Error('Este draft já está concluído e não pode ser editado.');
  }
}

function buildDraftUpdate(dados: Partial<DraftEditavel>): DraftUpdate {
  const updateData: DraftUpdate = {};

  if (dados.clienteNome !== undefined) updateData.clienteNome = dados.clienteNome;
  if (dados.clienteNif !== undefined) updateData.clienteNif = dados.clienteNif;
  if (dados.clienteEmail !== undefined) updateData.clienteEmail = dados.clienteEmail;
  if (dados.clienteMorada !== undefined) updateData.clienteMorada = dados.clienteMorada;
  if (dados.items !== undefined) updateData.items = dados.items;
  if (dados.iban !== undefined) updateData.iban = dados.iban;
  if (dados.prazoPagamento !== undefined) {
    updateData.prazoPagamento = dados.prazoPagamento;
  }
  if (dados.observacoes !== undefined) updateData.observacoes = dados.observacoes;
  if (dados.subtotal !== undefined) {
    updateData.subtotal = dados.subtotal?.toString() ?? null;
  }
  if (dados.ivaValor !== undefined) {
    updateData.ivaValor = dados.ivaValor?.toString() ?? null;
  }
  if (dados.total !== undefined) {
    updateData.total = dados.total?.toString() ?? null;
  }

  return updateData;
}

export async function atualizarDraft(
  draftId: string,
  dados: Partial<DraftEditavel>,
) {
  const { draft } = await requireDraftOwnership(draftId);
  assertDraftEditable(draft.status);

  await db
    .update(faturasDraft)
    .set(buildDraftUpdate(dados))
    .where(eq(faturasDraft.id, draftId));

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${draft.emailId}`);
}

export async function aprovarDraft(draftId: string) {
  const { draft } = await requireDraftOwnership(draftId);
  const { userId } = await auth();

  assertDraftEditable(draft.status);

  const dadosFinais = {
    cliente_nome: draft.clienteNome,
    cliente_nif: draft.clienteNif,
    cliente_email: draft.clienteEmail,
    cliente_morada: draft.clienteMorada,
    items: draft.items,
    subtotal: draft.subtotal,
    iva_valor: draft.ivaValor,
    total: draft.total,
    iban: draft.iban,
    prazo_pagamento: draft.prazoPagamento,
    observacoes: draft.observacoes,
  };

  await db
    .update(faturasDraft)
    .set({
      status: 'aprovado',
      reviewedAt: new Date(),
      reviewedBy: userId,
      dadosFinais,
    })
    .where(eq(faturasDraft.id, draftId));

  if (draft.emailId) {
    await db
      .update(emails)
      .set({ status: 'approved' })
      .where(eq(emails.id, draft.emailId));
  }

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${draft.emailId}`);
}

export async function rejeitarDraft(draftId: string) {
  const { draft } = await requireDraftOwnership(draftId);
  const { userId } = await auth();

  assertDraftEditable(draft.status);

  await db
    .update(faturasDraft)
    .set({
      status: 'rejeitado',
      reviewedAt: new Date(),
      reviewedBy: userId,
    })
    .where(eq(faturasDraft.id, draftId));

  if (draft.emailId) {
    await db
      .update(emails)
      .set({ status: 'rejected' })
      .where(eq(emails.id, draft.emailId));
  }

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${draft.emailId}`);
}

export interface EmitirResult {
  ok: boolean;
  error?: string;
  documentId?: number;
  documentNumber?: number;
}

export async function emitirFatura(
  draftId: string,
  opts: { finalize: boolean },
): Promise<EmitirResult> {
  const ownership = await requireDraftOwnership(draftId).catch(
    (err: unknown) => err as Error,
  );
  if (ownership instanceof Error) {
    return { ok: false, error: ownership.message };
  }

  const { draft, tenant } = ownership;

  if (draft.moloniDocumentId) {
    return {
      ok: false,
      error:
        'Este draft já tem documento Moloni associado. Abre o Moloni para editar/finalizar esse documento; a app não vai criar outro.',
    };
  }

  if (
    draft.status === 'emitida' ||
    draft.status === 'rascunho_moloni' ||
    draft.status === 'emissao_em_curso'
  ) {
    return { ok: false, error: 'Este draft já foi enviado para o Moloni.' };
  }

  if (
    !tenant.moloniApiKeyEnc ||
    !tenant.moloniCompanyId ||
    !tenant.moloniDefaultDocSetId ||
    !tenant.moloniFallbackProductId
  ) {
    return {
      ok: false,
      error: 'Moloni não configurado - vai a /settings',
    };
  }

  if (tenant.moloniDefaultDocType && tenant.moloniDefaultDocType !== 1) {
    return {
      ok: false,
      error: 'Neste momento a app só suporta emissão de Fatura no Moloni.',
    };
  }

  if (!draft.clienteNome) {
    return { ok: false, error: 'Cliente sem nome' };
  }

  if (draft.clienteNif && !isValidNifPt(draft.clienteNif)) {
    return {
      ok: false,
      error: 'NIF do cliente inválido. Corrige antes de emitir.',
    };
  }

  const items = (draft.items as DraftItem[] | null) ?? [];
  if (items.length === 0) {
    return { ok: false, error: 'Draft sem itens' };
  }

  const [locked] = await db
    .update(faturasDraft)
    .set({ status: 'emissao_em_curso', emitError: null })
    .where(
      and(
        eq(faturasDraft.id, draftId),
        eq(faturasDraft.tenantId, tenant.id),
        isNull(faturasDraft.moloniDocumentId),
      ),
    )
    .returning({ id: faturasDraft.id });

  if (!locked) {
    return {
      ok: false,
      error: 'Este draft já está a ser emitido ou já tem documento Moloni.',
    };
  }

  try {
    const apiKey = decrypt(tenant.moloniApiKeyEnc);

    const customer = await moloni.findOrCreateCustomer(
      apiKey,
      tenant.moloniCompanyId,
      {
        nif: draft.clienteNif,
        nome: draft.clienteNome,
        email: draft.clienteEmail,
        morada: draft.clienteMorada,
      },
    );

    const payload = mapDraftToInvoice(
      {
        items,
        observacoes: draft.observacoes,
        prazoPagamento: draft.prazoPagamento,
      },
      customer.customerId,
      {
        documentSetId: tenant.moloniDefaultDocSetId,
        fallbackProductId: tenant.moloniFallbackProductId,
        taxIdsByRate: getMoloniTaxIdsByRate(),
      },
      { finalize: opts.finalize },
    );

    const created = await moloni.invoiceCreate(
      apiKey,
      tenant.moloniCompanyId,
      payload,
    );

    await db
      .update(faturasDraft)
      .set({
        moloniDocumentId: created.documentId,
        emittedAt: new Date(),
        emitError: null,
        status: opts.finalize ? 'emitida' : 'rascunho_moloni',
      })
      .where(eq(faturasDraft.id, draftId));

    if (draft.emailId) {
      await db
        .update(emails)
        .set({ status: opts.finalize ? 'emitted' : 'draft_moloni' })
        .where(eq(emails.id, draft.emailId));
    }

    revalidatePath('/inbox');
    revalidatePath(`/inbox/${draft.emailId}`);

    return {
      ok: true,
      documentId: created.documentId,
      documentNumber: created.number,
    };
  } catch (err) {
    const msg =
      err instanceof MoloniApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Erro desconhecido';

    await db
      .update(faturasDraft)
      .set({ emitError: msg, status: 'falha_emissao' })
      .where(eq(faturasDraft.id, draftId));

    revalidatePath('/inbox');
    revalidatePath(`/inbox/${draft.emailId}`);
    return { ok: false, error: msg };
  }
}

function getMoloniTaxIdsByRate(): Partial<Record<SupportedIvaRate, number>> {
  return {
    0: getEnvInt('MOLONI_TAX_ID_0'),
    6: getEnvInt('MOLONI_TAX_ID_6'),
    13: getEnvInt('MOLONI_TAX_ID_13'),
    23: getEnvInt('MOLONI_TAX_ID_23'),
  };
}

function getEnvInt(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} tem de ser um numero inteiro positivo`);
  }
  return parsed;
}
