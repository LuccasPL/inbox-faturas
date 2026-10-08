import 'server-only';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emails } from '@/lib/db/schema';
import { INBOX_PAGE_SIZE, type InboxFilters } from '@/lib/inbox/filters';
import { inboxGroupConditions, inboxPriorityExpression, latestOwnedInboxDraft } from '@/lib/inbox/query-base';

export async function loadInbox(tenantId: string, filters: InboxFilters) {
  const draft = latestOwnedInboxDraft(tenantId);
  const groups = inboxGroupConditions(draft);

  const pattern = `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`;
  const state = filters.status === 'incerto' ? eq(emails.isFaturaRequest, 'incerto')
    : ['queued', 'retry_wait', 'processing', 'extraction_failed'].includes(filters.status)
      ? eq(emails.status, filters.status)
      : filters.status ? eq(draft.status, filters.status) : undefined;
  const matched = and(
    groups[filters.tab],
    filters.q ? or(ilike(emails.fromEmail, pattern), ilike(emails.subject, pattern),
      ilike(draft.clienteNome, pattern), ilike(draft.clienteEmail, pattern), ilike(draft.clienteNif, pattern)) : undefined,
    state,
    filters.priority ? sql`${inboxPriorityExpression(draft)} = ${filters.priority}` : undefined,
    filters.dateError ? sql`false` : undefined,
    // Stored timestamps are UTC without a zone; calendar filters use Lisbon days.
    filters.from ? sql`${emails.createdAt} >= ((${filters.from}::date::timestamp at time zone 'Europe/Lisbon') at time zone 'UTC')` : undefined,
    filters.to ? sql`${emails.createdAt} < (((${filters.to}::date + 1)::timestamp at time zone 'Europe/Lisbon') at time zone 'UTC')` : undefined,
  )!;

  const [totals] = await db.select({
    porRever: sql<number>`count(*) filter (where ${groups['por-rever']})`.mapWith(Number),
    concluidas: sql<number>`count(*) filter (where ${groups.concluidas})`.mapWith(Number),
    ignorados: sql<number>`count(*) filter (where ${groups.ignorados})`.mapWith(Number),
    matched: sql<number>`count(*) filter (where ${matched})`.mapWith(Number),
  }).from(emails).leftJoin(draft, eq(draft.emailId, emails.id)).where(eq(emails.tenantId, tenantId));

  const total = totals.matched;
  const totalPages = Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const rows = await db.select({
    email: {
      id: emails.id, fromEmail: emails.fromEmail, subject: emails.subject,
      status: emails.status, isFaturaRequest: emails.isFaturaRequest,
      triagemMotivo: emails.triagemMotivo, createdAt: emails.createdAt,
    },
    draft: {
      id: draft.id, status: draft.status, clienteNome: draft.clienteNome,
      clienteNif: draft.clienteNif, confiancaExtracao: draft.confiancaExtracao,
      total: draft.total, moloniDocumentId: draft.moloniDocumentId,
      proformaNumero: draft.proformaNumero, proformaSentAt: draft.proformaSentAt,
      shareExpiresAt: draft.shareExpiresAt,
    },
  }).from(emails).leftJoin(draft, eq(draft.emailId, emails.id))
    .where(and(eq(emails.tenantId, tenantId), matched))
    .orderBy(
      filters.priority === 'revisao-antiga' ? sql`${emails.createdAt} asc nulls last`
        : filters.priority === 'link-a-expirar' ? sql`${draft.shareExpiresAt} asc nulls last`
          : filters.priority === 'link-expirado' ? sql`${draft.shareExpiresAt} desc nulls last`
            : sql`${emails.createdAt} desc nulls last`,
      desc(emails.id),
    )
    .limit(INBOX_PAGE_SIZE).offset((page - 1) * INBOX_PAGE_SIZE);

  return {
    rows, total, page, totalPages,
    counts: { 'por-rever': totals.porRever, concluidas: totals.concluidas, ignorados: totals.ignorados },
  };
}
