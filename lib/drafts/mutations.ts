import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { calculateTotals } from '@/lib/faturas/totals';
import { DraftValidationError, parseDraftPatch, validateDraftForReview } from '@/lib/validation/draft';
import { isEmailBusy } from '@/lib/extraction/queue-policy';

type Draft = typeof faturasDraft.$inferSelect;
type Mutation = { kind: 'edit'; data: unknown } |
  { kind: 'approve' | 'reject'; userId: string | null };

export function normalizedFinancials(items: ReturnType<typeof validateDraftForReview>) {
  const totals = calculateTotals(items);
  return { items, subtotal: totals.subtotal.toFixed(2), ivaValor: totals.ivaValor.toFixed(2), total: totals.total.toFixed(2) };
}

export function finalDraftData(draft: Draft): Record<string, unknown> {
  return {
    calculo_versao: 2,
    cliente_nome: draft.clienteNome, cliente_nif: draft.clienteNif,
    cliente_email: draft.clienteEmail, cliente_morada: draft.clienteMorada,
    items: draft.items, subtotal: draft.subtotal, iva_valor: draft.ivaValor, total: draft.total,
    iban: draft.iban, prazo_pagamento: draft.prazoPagamento, observacoes: draft.observacoes,
  };
}

export async function mutateOwnedDraft(draftId: string, tenantId: string, mutation: Mutation): Promise<Draft> {
  const patch = mutation.kind === 'edit' ? parseDraftPatch(mutation.data) : null;
  return db.transaction(async (tx) => {
    const [reference] = await tx.select({ emailId: faturasDraft.emailId }).from(faturasDraft)
      .where(and(eq(faturasDraft.id, draftId), eq(faturasDraft.tenantId, tenantId)));
    if (!reference) throw new DraftValidationError('Draft indisponível. Atualiza a página.');
    // Match extraction's lock order: parent email first, then the draft.
    if (reference.emailId) {
      const [email] = await tx.select({ status: emails.status }).from(emails)
        .where(and(eq(emails.id, reference.emailId), eq(emails.tenantId, tenantId))).for('update');
      if (!email || isEmailBusy(email.status)) {
        throw new DraftValidationError('O email está em processamento. Aguarda e atualiza a página.');
      }
    }
    const [draft] = await tx.select().from(faturasDraft)
      .where(and(eq(faturasDraft.id, draftId), eq(faturasDraft.tenantId, tenantId))).for('update');
    if (!draft) throw new DraftValidationError('Draft indisponível. Atualiza a página.');
    if (!['pendente_revisao', 'falha_emissao'].includes(draft.status ?? 'pendente_revisao') || draft.moloniDocumentId || draft.proformaNumero) {
      throw new DraftValidationError('Este draft já está concluído ou em emissão e não pode ser alterado.');
    }
    let changes: Partial<typeof faturasDraft.$inferInsert>;
    if (mutation.kind === 'edit' && patch) {
      changes = { ...patch, ...(patch.items ? normalizedFinancials(patch.items) : {}) };
    } else {
      const reviewedAt = new Date();
      changes = { status: mutation.kind === 'approve' ? 'aprovado' : 'rejeitado', reviewedAt,
        reviewedBy: 'userId' in mutation ? mutation.userId : null };
      if (mutation.kind === 'approve') {
        const financials = normalizedFinancials(validateDraftForReview(draft));
        changes = { ...changes, ...financials, dadosFinais: finalDraftData({ ...draft, ...financials }) };
      }
    }
    const [updated] = await tx.update(faturasDraft).set(changes).where(eq(faturasDraft.id, draftId)).returning();
    if (mutation.kind !== 'edit' && draft.emailId) {
      await tx.update(emails).set({ status: mutation.kind === 'approve' ? 'approved' : 'rejected' })
        .where(and(eq(emails.id, draft.emailId), eq(emails.tenantId, tenantId)));
    }
    return updated;
  });
}

export function emissionSnapshotCondition(draft: Draft) {
  const fields = ['clienteNome', 'clienteNif', 'clienteEmail', 'clienteMorada', 'iban', 'prazoPagamento', 'observacoes'] as const;
  return and(
    draft.emailId ? sql`not exists (select 1 from ${emails} where ${emails.id} = ${draft.emailId} and ${emails.status} in ('processing', 'queued', 'retry_wait'))` : undefined,
    sql`${faturasDraft.items} is not distinct from ${JSON.stringify(draft.items)}::jsonb`,
    ...fields.map((field) => draft[field] === null ? isNull(faturasDraft[field]) : eq(faturasDraft[field], draft[field]!)),
  );
}
