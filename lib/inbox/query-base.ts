import 'server-only';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { PRIORITY_EXPIRED_DAYS, PRIORITY_REVIEW_HOURS, PRIORITY_SHARE_HOURS, type InboxPriority } from './priorities';

export function latestOwnedInboxDraft(tenantId: string) {
  return db.selectDistinctOn([faturasDraft.emailId], {
    id: faturasDraft.id, emailId: faturasDraft.emailId, status: faturasDraft.status,
    clienteNome: faturasDraft.clienteNome, clienteNif: faturasDraft.clienteNif, clienteEmail: faturasDraft.clienteEmail,
    confiancaExtracao: faturasDraft.confiancaExtracao, total: faturasDraft.total,
    moloniDocumentId: faturasDraft.moloniDocumentId, proformaNumero: faturasDraft.proformaNumero,
    proformaSentAt: faturasDraft.proformaSentAt, shareExpiresAt: faturasDraft.proformaShareExpiresAt,
    hasShare: sql<boolean>`${faturasDraft.proformaShareToken} is not null`.as('has_share'),
  }).from(faturasDraft).where(eq(faturasDraft.tenantId, tenantId))
    .orderBy(asc(faturasDraft.emailId), sql`${faturasDraft.createdAt} desc nulls last`, desc(faturasDraft.id)).as('inbox_draft');
}

type InboxDraft = ReturnType<typeof latestOwnedInboxDraft>;

export function inboxGroupConditions(draft: InboxDraft) {
  return {
    'por-rever': and(
      or(eq(emails.isFaturaRequest, 'sim'), eq(emails.isFaturaRequest, 'incerto'), isNull(emails.isFaturaRequest)),
      or(isNull(draft.status), inArray(draft.status, ['pendente_revisao', 'falha_emissao', 'emissao_em_curso']),
        and(inArray(emails.status, ['queued', 'retry_wait', 'processing', 'extraction_failed']), eq(draft.status, 'rejeitado'))),
    )!,
    concluidas: and(inArray(draft.status, ['aprovado', 'rascunho_moloni', 'emitida', 'emitida_proforma', 'rejeitado']),
      sql`not (${draft.status} = 'rejeitado' and coalesce(${emails.status}, '') in ('queued', 'retry_wait', 'processing', 'extraction_failed'))`)!,
    ignorados: eq(emails.isFaturaRequest, 'nao'),
  };
}

export function inboxPriorityExpression(draft: InboxDraft) {
  const pending = inboxGroupConditions(draft)['por-rever'];
  // UTC timestamps without a zone are compared to UTC; share deadlines already have a zone.
  return sql<InboxPriority | null>`case
    when ${pending} and ${draft.status} = 'emissao_em_curso' then 'emissao-incerta'
    when ${pending} and ${draft.status} = 'falha_emissao' then 'falha-emissao'
    when ${pending} and ${emails.status} = 'extraction_failed' then 'falha-extracao'
    when ${pending} and (${emails.status} is null or ${emails.status} not in ('processing', 'queued', 'retry_wait'))
      and ${emails.createdAt} <= (statement_timestamp() at time zone 'UTC') - ${PRIORITY_REVIEW_HOURS} * interval '1 hour'
      then 'revisao-antiga'
    when ${draft.status} = 'emitida_proforma' and ${draft.proformaNumero} > 0 and ${draft.hasShare}
      and ${draft.shareExpiresAt} > statement_timestamp()
      and ${draft.shareExpiresAt} <= statement_timestamp() + ${PRIORITY_SHARE_HOURS} * interval '1 hour'
      then 'link-a-expirar'
    when ${draft.status} = 'emitida_proforma' and ${draft.proformaNumero} > 0 and ${draft.hasShare}
      and ${draft.shareExpiresAt} <= statement_timestamp()
      and ${draft.shareExpiresAt} >= statement_timestamp() - ${PRIORITY_EXPIRED_DAYS * 24} * interval '1 hour'
      then 'link-expirado'
    else null end`;
}
