'use server';

import { db } from '@/lib/db';
import { faturasDraft, emails } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { decrypt } from '@/lib/crypto';
import * as moloni from '@/lib/moloni/api';
import { MoloniApiError } from '@/lib/moloni/client';
import {
  mapDraftToInvoice,
  type DraftItem,
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

export async function atualizarDraft(
  draftId: string,
  dados: Partial<DraftEditavel>
) {
  await requireDraftOwnership(draftId);

  // Converte numbers para string (porque numeric no Drizzle é string)
  const updateData: any = { ...dados };
  if (dados.subtotal !== undefined) {
    updateData.subtotal = dados.subtotal?.toString() ?? null;
  }
  if (dados.ivaValor !== undefined) {
    updateData.ivaValor = dados.ivaValor?.toString() ?? null;
  }
  if (dados.total !== undefined) {
    updateData.total = dados.total?.toString() ?? null;
  }

  await db
    .update(faturasDraft)
    .set(updateData)
    .where(eq(faturasDraft.id, draftId));

  revalidatePath(`/inbox`);
}

export async function aprovarDraft(draftId: string) {
  const { draft } = await requireDraftOwnership(draftId);
  const { userId } = await auth();

  // Snapshot dos dados no momento da aprovação
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

  // Atualiza status do email
  if (draft.emailId) {
    await db
      .update(emails)
      .set({ status: 'approved' })
      .where(eq(emails.id, draft.emailId));
  }

  revalidatePath(`/inbox`);
  revalidatePath(`/inbox/${draft.emailId}`);
}

export async function rejeitarDraft(draftId: string) {
  const { draft } = await requireDraftOwnership(draftId);
  const { userId } = await auth();

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

  revalidatePath(`/inbox`);
  revalidatePath(`/inbox/${draft.emailId}`);
}

/* -------------------------------------------------------------------------- */
/*  Emissão no Moloni                                                         */
/* -------------------------------------------------------------------------- */

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

  // 2. Valida que Moloni está configurado
  if (
    !tenant.moloniApiKeyEnc ||
    !tenant.moloniCompanyId ||
    !tenant.moloniDefaultDocSetId ||
    !tenant.moloniFallbackProductId
  ) {
    return {
      ok: false,
      error: 'Moloni não configurado — vai a /settings',
    };
  }

  // 3. Valida campos do draft
  if (!draft.clienteNome) {
    return { ok: false, error: 'Cliente sem nome' };
  }
  // NIF é opcional (consumidor final usa 999999990 no Moloni).
  // Mas se vier preenchido, tem de ser válido.
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

  try {
    const apiKey = decrypt(tenant.moloniApiKeyEnc);

    // 4. Procurar / criar cliente no Moloni
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

    // 5. Construir payload e criar
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
      },
      { finalize: opts.finalize },
    );

    const created = await moloni.invoiceCreate(
      apiKey,
      tenant.moloniCompanyId,
      payload,
    );

    // 6. Persiste resultado
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

    revalidatePath(`/inbox`);
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

    revalidatePath(`/inbox/${draft.emailId}`);
    return { ok: false, error: msg };
  }
}