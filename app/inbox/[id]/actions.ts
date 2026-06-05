'use server';

import { db } from '@/lib/db';
import { faturasDraft, emails } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

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
  const { userId } = await auth();
  
  if (!userId) {
    throw new Error('Não autenticado');
  }

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
  const { userId } = await auth();
  
  if (!userId) {
    throw new Error('Não autenticado');
  }

  // Busca o draft atual para guardar snapshot dos dados finais
  const [draft] = await db
    .select()
    .from(faturasDraft)
    .where(eq(faturasDraft.id, draftId))
    .limit(1);

  if (!draft) {
    throw new Error('Draft não encontrado');
  }

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
  const { userId } = await auth();
  
  if (!userId) {
    throw new Error('Não autenticado');
  }

  const [draft] = await db
    .select()
    .from(faturasDraft)
    .where(eq(faturasDraft.id, draftId))
    .limit(1);

  if (!draft) {
    throw new Error('Draft não encontrado');
  }

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