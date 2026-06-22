'use server';

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

export async function reclassificarComoFatura(emailId: string) {
  const { email } = await requireEmailOwnership(emailId);
  const currentDraftId = await getLatestDraftIdForEmail(email.id, email.tenantId!);

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
      dados,
      rawResponse,
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
  const currentDraftId = await getLatestDraftIdForEmail(email.id, email.tenantId!);

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
    await db.transaction(async (tx) => {
      await tx
        .update(emails)
        .set({ status: 'ignored' })
        .where(eq(emails.id, email.id));

      await tx
        .update(faturasDraft)
        .set({ status: 'rejeitado' })
        .where(
          and(
            eq(faturasDraft.emailId, email.id),
            eq(faturasDraft.tenantId, email.tenantId!),
          ),
        );
    });
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
      dados,
      rawResponse,
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

/**
 * Apaga permanentemente um email (e em cascade o draft associado).
 * Útil para limpar ruído: spam que passou triagem, drafts de teste, etc.
 */
export async function eliminarEmail(emailId: string) {
  const { email } = await requireEmailOwnership(emailId);

  // O schema declara ON DELETE CASCADE no email_id de faturas_draft,
  // por isso o draft é apagado automaticamente.
  await db.delete(emails).where(eq(emails.id, email.id));

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
