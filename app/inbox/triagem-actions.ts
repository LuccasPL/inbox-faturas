'use server';

import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { extrairDadosFatura } from '@/lib/extraction/extract-fatura';
import { extractPdfAttachments } from '@/lib/extraction/attachments';
import { triarEmail } from '@/lib/extraction/triagem-email';
import { buscarHistoricoCliente } from '@/lib/extraction/historico-cliente';
import { requireEmailOwnership } from '@/lib/auth/tenant';

export async function reclassificarComoFatura(emailId: string) {
  const { email } = await requireEmailOwnership(emailId);

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
    const pdfs = extractPdfAttachments(email.attachments);
    const historico = await buscarHistoricoCliente({
      tenantId: email.tenantId!,
      fromEmail: email.fromEmail,
    });

    const { dados, rawResponse } = await extrairDadosFatura(
      email.subject || '',
      email.bodyText || '',
      email.fromEmail,
      pdfs,
      historico,
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

/**
 * Re-corre triagem + extração no email original.
 * Apaga draft existente e cria um novo. Útil quando:
 * - Prompts foram melhorados e queremos refazer
 * - A extração falhou na primeira vez
 * - O email foi inicialmente classificado como "incerto" / "nao" e queremos reavaliar
 */
export async function reprocessarEmail(emailId: string) {
  const { email } = await requireEmailOwnership(emailId);

  // Marca como em processamento
  await db
    .update(emails)
    .set({ status: 'processing' })
    .where(eq(emails.id, email.id));

  // 1. Triagem
  let triagemResultado: Awaited<ReturnType<typeof triarEmail>>;
  try {
    triagemResultado = await triarEmail(
      email.subject || '',
      email.bodyText || '',
      email.fromEmail,
    );
    await db
      .update(emails)
      .set({
        isFaturaRequest: triagemResultado.is_fatura_request,
        triagemMotivo: triagemResultado.motivo,
        triagemConfianca: triagemResultado.confianca,
      })
      .where(eq(emails.id, email.id));
  } catch (err) {
    console.error('Erro na re-triagem:', err);
    await db
      .update(emails)
      .set({ status: 'extraction_failed' })
      .where(eq(emails.id, email.id));
    revalidatePath(`/inbox/${email.id}`);
    revalidatePath('/inbox');
    throw new Error('Falha na re-triagem');
  }

  // 2. Se a triagem disser "nao", paramos aqui e marcamos ignored
  if (triagemResultado.is_fatura_request === 'nao') {
    await db
      .update(emails)
      .set({ status: 'ignored' })
      .where(eq(emails.id, email.id));
    revalidatePath(`/inbox/${email.id}`);
    revalidatePath('/inbox');
    return;
  }

  // 3. Apaga draft existente (substitui)
  await db
    .delete(faturasDraft)
    .where(
      and(
        eq(faturasDraft.emailId, email.id),
        eq(faturasDraft.tenantId, email.tenantId!),
      ),
    );

  // 4. Extração nova
  try {
    const pdfs = extractPdfAttachments(email.attachments);
    // Não passamos excludeDraftId aqui porque o draft anterior já foi apagado acima.
    const historico = await buscarHistoricoCliente({
      tenantId: email.tenantId!,
      fromEmail: email.fromEmail,
    });
    const { dados, rawResponse } = await extrairDadosFatura(
      email.subject || '',
      email.bodyText || '',
      email.fromEmail,
      pdfs,
      historico,
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
  } catch (err) {
    console.error('Erro na re-extração:', err);
    await db
      .update(emails)
      .set({ status: 'extraction_failed' })
      .where(eq(emails.id, email.id));
    throw new Error('Falha na re-extração');
  }

  revalidatePath(`/inbox/${email.id}`);
  revalidatePath('/inbox');
}

export async function reclassificarComoIgnorado(emailId: string) {
  const { email } = await requireEmailOwnership(emailId);

  await db
    .update(emails)
    .set({
      isFaturaRequest: 'nao',
      triagemMotivo: 'Marcado como não-fatura pelo utilizador',
      status: 'ignored',
    })
    .where(eq(emails.id, emailId));

  // Se já tinha draft, marca como rejeitado — filtrado pelo emailId
  // que já pertence ao tenant via requireEmailOwnership acima.
  await db
    .update(faturasDraft)
    .set({ status: 'rejeitado' })
    .where(
      and(
        eq(faturasDraft.emailId, email.id),
        eq(faturasDraft.tenantId, email.tenantId!),
      ),
    );

  revalidatePath('/inbox');
}
