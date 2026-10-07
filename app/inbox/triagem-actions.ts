'use server';

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { extrairDadosFatura } from '@/lib/extraction/extract-fatura';
import { extractPdfAttachments } from '@/lib/extraction/attachments';
import { triarEmail } from '@/lib/extraction/triagem-email';
import { buscarHistoricoCliente } from '@/lib/extraction/historico-cliente';
import { requireEmailOwnership } from '@/lib/auth/tenant';
import { replaceDraftForEmail } from '@/lib/drafts/persist-extraction';
import { RATE_LIMITS } from '@/lib/security/policies';
import { requireActionRateLimit } from '@/lib/security/rate-limit';
import { claimEmailProcessing, finishEmailProcessing, ignoreEmail } from '@/lib/extraction/processing';

export async function reclassificarComoFatura(emailId: string) {
  const { email } = await requireEmailOwnership(emailId);
  await requireActionRateLimit(email.tenantId!, RATE_LIMITS.ai);
  const currentDraftId = await getLatestDraftIdForEmail(email.id, email.tenantId!);
  const processingToken = await claimEmailProcessing(email.id, email.tenantId!, true);
  if (!processingToken) throw new Error('Este email já está a ser processado. Tenta novamente mais tarde.');

  // Marca como sim e corre extração
  await db
    .update(emails)
    .set({
      isFaturaRequest: 'sim',
      triagemMotivo: 'Reclassificado manualmente pelo utilizador',
    })
    .where(and(eq(emails.id, emailId), eq(emails.processingToken, processingToken)));

  try {
    const pdfs = extractPdfAttachments(email.attachments);
    const historico = await buscarHistoricoCliente({
      tenantId: email.tenantId!,
      fromEmail: email.fromEmail,
      excludeDraftId: currentDraftId ?? undefined,
    });

    const { dados, rawResponse } = await extrairDadosFatura(
      email.subject || '',
      email.bodyText || '',
      email.fromEmail,
      pdfs,
      historico,
    );

    await replaceDraftForEmail({
      emailId: email.id,
      tenantId: email.tenantId!,
      processingToken,
      dados,
      rawResponse,
    });

    await finishEmailProcessing(email.id, processingToken, 'extracted');
  } catch (error) {
    console.error('Erro na extração após reclassificação:', error);
    await finishEmailProcessing(email.id, processingToken, 'extraction_failed');
    throw new Error('Falha na extração após reclassificação');
  }

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${email.id}`);
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
  await requireActionRateLimit(email.tenantId!, RATE_LIMITS.ai);
  const currentDraftId = await getLatestDraftIdForEmail(email.id, email.tenantId!);
  const { userId } = await auth();

  const processingToken = await claimEmailProcessing(email.id, email.tenantId!, true);
  if (!processingToken) throw new Error('Este email já está a ser processado. Tenta novamente mais tarde.');

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
      .where(and(eq(emails.id, email.id), eq(emails.processingToken, processingToken)));
  } catch (err) {
    console.error('Erro na re-triagem:', err);
    await finishEmailProcessing(email.id, processingToken, 'extraction_failed');
    revalidatePath(`/inbox/${email.id}`);
    revalidatePath('/inbox');
    throw new Error('Falha na re-triagem');
  }

  // 2. Se a triagem disser "nao", paramos aqui e marcamos ignored
  if (triagemResultado.is_fatura_request === 'nao') {
    await ignoreEmail({ emailId: email.id, tenantId: email.tenantId!, processingToken, reviewedBy: userId });
    revalidatePath(`/inbox/${email.id}`);
    revalidatePath('/inbox');
    return;
  }

  // 3. Extração nova
  try {
    const pdfs = extractPdfAttachments(email.attachments);
    const historico = await buscarHistoricoCliente({
      tenantId: email.tenantId!,
      fromEmail: email.fromEmail,
      excludeDraftId: currentDraftId ?? undefined,
    });
    const { dados, rawResponse } = await extrairDadosFatura(
      email.subject || '',
      email.bodyText || '',
      email.fromEmail,
      pdfs,
      historico,
    );

    await replaceDraftForEmail({
      emailId: email.id,
      tenantId: email.tenantId!,
      processingToken,
      dados,
      rawResponse,
    });

    await finishEmailProcessing(email.id, processingToken, 'extracted');
  } catch (err) {
    console.error('Erro na re-extração:', err);
    await finishEmailProcessing(email.id, processingToken, 'extraction_failed');
    throw new Error('Falha na re-extração');
  }

  revalidatePath(`/inbox/${email.id}`);
  revalidatePath('/inbox');
}

/**
 * Apaga permanentemente um email (e em cascade o draft associado).
 * Útil para limpar ruído: spam que passou triagem, drafts de teste, etc.
 */
export async function eliminarEmail(emailId: string) {
  const { email } = await requireEmailOwnership(emailId);
  await requireActionRateLimit(email.tenantId!, RATE_LIMITS.mutation);

  // O schema declara ON DELETE CASCADE no email_id de faturas_draft,
  // por isso o draft é apagado automaticamente.
  await db.delete(emails).where(eq(emails.id, email.id));

  revalidatePath('/inbox');
}

export async function reclassificarComoIgnorado(emailId: string) {
  const { email } = await requireEmailOwnership(emailId);
  await requireActionRateLimit(email.tenantId!, RATE_LIMITS.mutation);
  const { userId } = await auth();
  await ignoreEmail({ emailId: email.id, tenantId: email.tenantId!, reviewedBy: userId });

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${email.id}`);
}

async function getLatestDraftIdForEmail(
  emailId: string,
  tenantId: string,
): Promise<string | null> {
  const [draft] = await db
    .select({ id: faturasDraft.id })
    .from(faturasDraft)
    .where(
      and(eq(faturasDraft.emailId, emailId), eq(faturasDraft.tenantId, tenantId)),
    )
    .orderBy(desc(faturasDraft.createdAt))
    .limit(1);

  return draft?.id ?? null;
}
