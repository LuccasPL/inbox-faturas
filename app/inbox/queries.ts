import 'server-only';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { INBOX_PAGE_SIZE, type InboxFilters } from '@/lib/inbox/filters';

const CONCLUIDO_STATUSES = ['aprovado', 'rascunho_moloni', 'emitida', 'emitida_proforma', 'rejeitado'];

export async function loadInbox(tenantId: string, filters: InboxFilters) {
  // A single owned draft per email keeps legacy duplicates out of counts and pages.
  const draft = db.selectDistinctOn([faturasDraft.emailId], {
    id: faturasDraft.id,
    emailId: faturasDraft.emailId,
    status: faturasDraft.status,
    clienteNome: faturasDraft.clienteNome,
    clienteNif: faturasDraft.clienteNif,
    clienteEmail: faturasDraft.clienteEmail,
    confiancaExtracao: faturasDraft.confiancaExtracao,
    total: faturasDraft.total,
    moloniDocumentId: faturasDraft.moloniDocumentId,
    proformaNumero: faturasDraft.proformaNumero,
    proformaSentAt: faturasDraft.proformaSentAt,
  }).from(faturasDraft).where(eq(faturasDraft.tenantId, tenantId))
    .orderBy(asc(faturasDraft.emailId), sql`${faturasDraft.createdAt} desc nulls last`, desc(faturasDraft.id))
    .as('inbox_draft');

  const groups = {
    'por-rever': and(
      or(eq(emails.isFaturaRequest, 'sim'), eq(emails.isFaturaRequest, 'incerto'), isNull(emails.isFaturaRequest)),
      or(isNull(draft.status), inArray(draft.status, ['pendente_revisao', 'falha_emissao', 'emissao_em_curso'])),
    )!,
    concluidas: inArray(draft.status, CONCLUIDO_STATUSES),
    ignorados: eq(emails.isFaturaRequest, 'nao'),
  };

  const pattern = `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`;
  const state = filters.status === 'incerto' ? eq(emails.isFaturaRequest, 'incerto')
    : ['processing', 'extraction_failed'].includes(filters.status)
      ? and(eq(emails.status, filters.status), isNull(draft.id))
      : filters.status ? eq(draft.status, filters.status) : undefined;
  const matched = and(
    groups[filters.tab],
    filters.q ? or(ilike(emails.fromEmail, pattern), ilike(emails.subject, pattern),
      ilike(draft.clienteNome, pattern), ilike(draft.clienteEmail, pattern), ilike(draft.clienteNif, pattern)) : undefined,
    state,
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
    },
  }).from(emails).leftJoin(draft, eq(draft.emailId, emails.id))
    .where(and(eq(emails.tenantId, tenantId), matched))
    .orderBy(sql`${emails.createdAt} desc nulls last`, desc(emails.id))
    .limit(INBOX_PAGE_SIZE).offset((page - 1) * INBOX_PAGE_SIZE);

  return {
    rows, total, page, totalPages,
    counts: { 'por-rever': totals.porRever, concluidas: totals.concluidas, ignorados: totals.ignorados },
  };
}
