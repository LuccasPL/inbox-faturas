import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';

const FINAL_DRAFT_STATUSES = new Set([
  'aprovado', 'emitida', 'rascunho_moloni', 'emissao_em_curso', 'emitida_proforma',
]);

export function isProtectedDraft(draft: Pick<typeof faturasDraft.$inferSelect, 'status' | 'moloniDocumentId' | 'proformaNumero'>): boolean {
  return !!draft.moloniDocumentId || !!draft.proformaNumero || FINAL_DRAFT_STATUSES.has(draft.status ?? '');
}

export class EmailDeletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailDeletionError';
  }
}

export function emailDeletionBlockReason(
  status: string | null,
  drafts: Array<Pick<typeof faturasDraft.$inferSelect, 'status' | 'moloniDocumentId' | 'proformaNumero'>>,
): string | null {
  if (status === 'processing') return 'Aguarda o fim do processamento antes de eliminar.';
  if (['approved', 'emitted', 'draft_moloni', 'emitted_proforma'].includes(status ?? '') ||
    drafts.some(isProtectedDraft)) {
    return 'Emails com documentos aprovados ou emitidos não podem ser eliminados.';
  }
  return null;
}

export async function deleteEmailSafely(emailId: string, tenantId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [email] = await tx.select({ status: emails.status }).from(emails)
      .where(and(eq(emails.id, emailId), eq(emails.tenantId, tenantId))).for('update');
    if (!email) throw new EmailDeletionError('Email indisponível. Atualiza a página.');
    // Inspect every cascading child, including inconsistent tenant associations.
    const drafts = await tx.select().from(faturasDraft)
      .where(eq(faturasDraft.emailId, emailId)).for('update');
    if (drafts.some((draft) => draft.tenantId !== tenantId)) {
      throw new EmailDeletionError('Este email não pode ser eliminado. Contacta o suporte.');
    }
    const reason = emailDeletionBlockReason(email.status, drafts);
    if (reason) throw new EmailDeletionError(reason);
    await tx.delete(emails).where(and(eq(emails.id, emailId), eq(emails.tenantId, tenantId)));
  });
}

export async function claimEmailProcessing(emailId: string, tenantId: string, reprocess = false): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [email] = await tx.select({
      status: emails.status,
      active: sql<boolean>`${emails.status} = 'processing' and coalesce(${emails.processingStartedAt}, ${emails.createdAt}, now()) > now() - interval '5 minutes'`,
    }).from(emails).where(and(eq(emails.id, emailId), eq(emails.tenantId, tenantId))).for('update');
    if (!email || email.active) return null;
    if (!reprocess && !['received', 'processing'].includes(email.status ?? '')) return null;
    const drafts = await tx.select().from(faturasDraft)
      .where(and(eq(faturasDraft.emailId, emailId), eq(faturasDraft.tenantId, tenantId))).for('update');
    if (drafts.some(isProtectedDraft)) {
      throw new Error('Este email tem um documento aprovado ou emitido e não pode ser reprocessado.');
    }
    const token = randomUUID();
    await tx.update(emails).set({
      status: 'processing', processingToken: token, processingStartedAt: new Date(),
    }).where(eq(emails.id, emailId));
    return token;
  });
}

export async function finishEmailProcessing(emailId: string, token: string, status: string): Promise<void> {
  const [row] = await db.update(emails).set({ status, processingToken: null, processingStartedAt: null })
    .where(and(eq(emails.id, emailId), eq(emails.processingToken, token), eq(emails.status, 'processing')))
    .returning({ id: emails.id });
  if (!row) throw new Error('O processamento deste email já foi substituído por outra operação.');
}

export async function ignoreEmail(input: {
  emailId: string;
  tenantId: string;
  reviewedBy: string | null;
  processingToken?: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [email] = await tx.select().from(emails).where(and(
      eq(emails.id, input.emailId), eq(emails.tenantId, input.tenantId),
    )).for('update');
    if (!email) throw new Error('Email não encontrado.');
    if (input.processingToken) {
      if (email.processingToken !== input.processingToken || email.status !== 'processing') {
        throw new Error('Este processamento já não está ativo.');
      }
    } else if (email.status === 'processing') {
      throw new Error('Este email está a ser processado. Tenta novamente mais tarde.');
    }
    const drafts = await tx.select().from(faturasDraft).where(and(
      eq(faturasDraft.emailId, input.emailId), eq(faturasDraft.tenantId, input.tenantId),
    )).for('update');
    if (drafts.some(isProtectedDraft)) {
      throw new Error('Não é possível ignorar um email com documento aprovado ou emitido.');
    }
    await tx.update(emails).set({
      status: 'ignored', isFaturaRequest: 'nao',
      triagemMotivo: input.processingToken ? email.triagemMotivo : 'Marcado como não-fatura pelo utilizador',
      processingToken: null, processingStartedAt: null,
    }).where(eq(emails.id, input.emailId));
    await tx.update(faturasDraft).set({
      status: 'rejeitado', reviewedAt: new Date(), reviewedBy: input.reviewedBy,
    }).where(and(eq(faturasDraft.emailId, input.emailId), eq(faturasDraft.tenantId, input.tenantId)));
  });
}
