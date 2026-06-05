'use server';

import { db } from '@/lib/db';
import { emails, tenants, faturasDraft } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { extrairDadosFatura } from '@/lib/extraction/extract-fatura';

export async function reclassificarComoFatura(emailId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('Não autenticado');

  // Busca o email
  const [email] = await db
    .select()
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1);

  if (!email) throw new Error('Email não encontrado');

  // Marca como sim e corre extração
  await db
    .update(emails)
    .set({
      isFaturaRequest: 'sim',
      triagemMotivo: 'Reclassificado manualmente pelo utilizador',
      status: 'processing',
    })
    .where(eq(emails.id, emailId));

  try {
    const { dados, rawResponse } = await extrairDadosFatura(
      email.subject || '',
      email.bodyText || '',
      email.fromEmail
    );

    await db.insert(faturasDraft).values({
      emailId: email.id,
      tenantId: email.tenantId,
      clienteNome: dados.cliente_nome,
      clienteNif: dados.cliente_nif,
      clienteEmail: dados.cliente_email,
      clienteMorada: dados.cliente_morada,
      items: dados.items,
      subtotal: dados.subtotal?.toString(),
      ivaValor: dados.iva_valor?.toString(),
      total: dados.total?.toString(),
      iban: dados.iban,
      prazoPagamento: dados.prazo_pagamento,
      observacoes: dados.observacoes,
      confiancaExtracao: dados.confianca_extracao,
      rawIaResponse: rawResponse,
    });

    await db
      .update(emails)
      .set({ status: 'extracted' })
      .where(eq(emails.id, email.id));
  } catch (error) {
    console.error('Erro na extração após reclassificação:', error);
    await db
      .update(emails)
      .set({ status: 'extraction_failed' })
      .where(eq(emails.id, email.id));
  }

  revalidatePath('/inbox');
}

export async function reclassificarComoIgnorado(emailId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('Não autenticado');

  await db
    .update(emails)
    .set({
      isFaturaRequest: 'nao',
      triagemMotivo: 'Marcado como não-fatura pelo utilizador',
      status: 'ignored',
    })
    .where(eq(emails.id, emailId));

  // Se já tinha draft, marca como rejeitado
  await db
    .update(faturasDraft)
    .set({ status: 'rejeitado' })
    .where(eq(faturasDraft.emailId, emailId));

  revalidatePath('/inbox');
}