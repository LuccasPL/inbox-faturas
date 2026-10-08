import 'server-only';
import { and, count, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { inboxGroupConditions, latestOwnedInboxDraft } from '@/lib/inbox/query-base';

const CONCLUIDO_STATUSES = ['aprovado', 'rascunho_moloni', 'emitida', 'emitida_proforma'] as const;
type EmissionMode = 'moloni' | 'pdf_proforma';

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
}

export interface ActivityItem {
  id: string;
  emailId: string | null;
  kind: 'email' | 'draft';
  status: string;
  label: string;
  detail: string | null;
  total: number | null;
  at: Date | null;
}

export interface IvaSlice {
  rate: number;
  count: number;
}

export interface DashboardData {
  porRever: number;
  emitidasMes: number;
  receitaMes: number;
  taxaAprovacao: number | null;
  outputLabel: string;
  outputHint: string;
  funnelOutputLabel: string;
  pedidosPorDia: { date: string; count: number }[];
  topClientes: { key: string; nome: string; total: number; count: number }[];
  distribuicaoConfianca: { alta: number; media: number; baixa: number };
  funnel: FunnelStage[];
  atividade: ActivityItem[];
  distribuicaoIva: IvaSlice[];
}


function asNumber(value: string | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

export async function loadDashboard(tenantId: string, emissionMode: EmissionMode): Promise<DashboardData> {
  const outputStatus = emissionMode === 'pdf_proforma' ? 'emitida_proforma' : 'emitida';
  const outputLabel = emissionMode === 'pdf_proforma' ? 'Proformas (mês)' : 'Emitidas (mês)';
  const outputHint = emissionMode === 'pdf_proforma' ? 'proformas emitidas pela app' : 'documentos no Moloni';
  const funnelOutputLabel = emissionMode === 'pdf_proforma' ? 'Proformas emitidas' : 'Emitidas';
  const inboxDraft = latestOwnedInboxDraft(tenantId);
  const confirmed = inArray(faturasDraft.status, [...CONCLUIDO_STATUSES]);
  const monthly = sql`${faturasDraft.status} = ${outputStatus} and
    coalesce(${faturasDraft.emittedAt}, ${faturasDraft.createdAt}) >=
    ((date_trunc('month', statement_timestamp() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon') at time zone 'UTC')`;
  const clientKey = sql<string>`coalesce(nullif(btrim(${faturasDraft.clienteNif}), ''),
    'sem-nif:' || lower(coalesce(nullif(btrim(${faturasDraft.clienteNome}), ''), '-')))`;
  const clientTotal = sql<string>`coalesce(sum(${faturasDraft.total}), 0)`;
  // Independent, bounded queries share the existing five-connection pool.
  const [pending, stats, emailStats, days, clients, ultimosDrafts, draftsComItems] = await Promise.all([
    db.select({ value: count() }).from(emails).leftJoin(inboxDraft, eq(inboxDraft.emailId, emails.id))
      .where(and(eq(emails.tenantId, tenantId), inboxGroupConditions(inboxDraft)['por-rever'])),
    db.select({
      drafts: count(),
      approved: sql<number>`count(*) filter (where ${confirmed})`.mapWith(Number),
      reviewed: sql<number>`count(*) filter (where ${faturasDraft.status} in ('aprovado', 'rascunho_moloni', 'emitida', 'emitida_proforma', 'rejeitado'))`.mapWith(Number),
      emitted: sql<number>`count(*) filter (where ${faturasDraft.status} = ${outputStatus})`.mapWith(Number),
      monthlyCount: sql<number>`count(*) filter (where ${monthly})`.mapWith(Number),
      monthlyTotal: sql<string>`coalesce(sum(${faturasDraft.total}) filter (where ${monthly}), 0)`,
      alta: sql<number>`count(*) filter (where ${faturasDraft.confiancaExtracao} = 'alta')`.mapWith(Number),
      media: sql<number>`count(*) filter (where ${faturasDraft.confiancaExtracao} = 'media')`.mapWith(Number),
      baixa: sql<number>`count(*) filter (where ${faturasDraft.confiancaExtracao} = 'baixa')`.mapWith(Number),
    }).from(faturasDraft).where(eq(faturasDraft.tenantId, tenantId)),
    db.select({ received: count(),
      positive: sql<number>`count(*) filter (where ${emails.isFaturaRequest} in ('sim', 'incerto'))`.mapWith(Number),
    }).from(emails).where(eq(emails.tenantId, tenantId)),
    db.select({
      date: sql<string>`to_char((${emails.createdAt} at time zone 'UTC') at time zone 'Europe/Lisbon', 'YYYY-MM-DD')`,
      value: count(),
    }).from(emails).where(and(eq(emails.tenantId, tenantId),
      sql`${emails.createdAt} >= (((statement_timestamp() at time zone 'Europe/Lisbon')::date - 29)::timestamp at time zone 'Europe/Lisbon') at time zone 'UTC'`))
      .groupBy(sql`to_char((${emails.createdAt} at time zone 'UTC') at time zone 'Europe/Lisbon', 'YYYY-MM-DD')`),
    db.select({ key: clientKey, nome: sql<string>`min(coalesce(nullif(btrim(${faturasDraft.clienteNome}), ''), '-'))`,
      total: clientTotal, count: count(),
    }).from(faturasDraft).where(and(eq(faturasDraft.tenantId, tenantId), confirmed, isNotNull(faturasDraft.clienteNome)))
      .groupBy(clientKey).orderBy(desc(clientTotal), clientKey).limit(5),
    db.select({ id: faturasDraft.id, emailId: faturasDraft.emailId, status: faturasDraft.status,
      clienteNome: faturasDraft.clienteNome, total: faturasDraft.total, reviewedAt: faturasDraft.reviewedAt,
      emittedAt: faturasDraft.emittedAt, createdAt: faturasDraft.createdAt,
    }).from(faturasDraft).where(eq(faturasDraft.tenantId, tenantId))
      .orderBy(desc(sql`coalesce(${faturasDraft.emittedAt}, ${faturasDraft.reviewedAt}, ${faturasDraft.createdAt})`), desc(faturasDraft.id)).limit(8),
    db.select({ items: faturasDraft.items }).from(faturasDraft)
      .where(and(eq(faturasDraft.tenantId, tenantId), confirmed)).orderBy(desc(faturasDraft.createdAt), desc(faturasDraft.id)).limit(50),
  ]);
  const totals = stats[0];
  const distr = { alta: totals.alta, media: totals.media, baixa: totals.baixa };
  const topClientes = clients.map(client => ({ ...client, total: asNumber(client.total) }));
  const dailyCounts = new Map(days.map(day => [day.date, day.value]));
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  const today = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`);
  const pedidosPorDia = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today.getTime() - (29 - index) * 86_400_000).toISOString().slice(0, 10);
    return { date, count: dailyCounts.get(date) ?? 0 };
  });
  const funnel: FunnelStage[] = [
    { key: 'recebidos', label: 'Emails recebidos', value: emailStats[0].received },
    { key: 'triagem', label: 'Triagem positiva', value: emailStats[0].positive },
    { key: 'drafts', label: 'Drafts extraídos', value: totals.drafts },
    { key: 'aprovados', label: 'Aprovados', value: totals.approved },
    { key: 'emitidas', label: funnelOutputLabel, value: totals.emitted },
  ];
  const atividade: ActivityItem[] = ultimosDrafts.map((d) => {
    const status = d.status ?? 'pendente_revisao';
    let label = 'Draft criado';
    let at: Date | null = d.createdAt;
    if (status === 'emitida') {
      label = 'Fatura emitida';
      at = d.emittedAt ?? d.reviewedAt ?? d.createdAt;
    } else if (status === 'emitida_proforma') {
      label = 'Proforma emitida';
      at = d.emittedAt ?? d.reviewedAt ?? d.createdAt;
    } else if (status === 'rascunho_moloni') {
      label = 'Rascunho criado no Moloni';
      at = d.emittedAt ?? d.reviewedAt ?? d.createdAt;
    } else if (status === 'aprovado') {
      label = 'Draft aprovado';
      at = d.reviewedAt ?? d.createdAt;
    } else if (status === 'rejeitado') {
      label = 'Draft rejeitado';
      at = d.reviewedAt ?? d.createdAt;
    } else if (status === 'falha_emissao') {
      label = 'Falha na emissão';
      at = d.reviewedAt ?? d.createdAt;
    }
    return {
      id: d.id,
      emailId: d.emailId,
      kind: 'draft' as const,
      status,
      label,
      detail: d.clienteNome,
      total: d.total === null ? null : asNumber(d.total),
      at,
    };
  });


  const ivaCounts = new Map<number, number>();
  for (const { items } of draftsComItems) {
    if (!Array.isArray(items)) continue;
    for (const item of items as Array<{ iva_percentagem?: number }>) {
      const raw = item.iva_percentagem;
      const rate = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 23;
      ivaCounts.set(rate, (ivaCounts.get(rate) ?? 0) + 1);
    }
  }
  return {
    porRever: pending[0]?.value ?? 0, emitidasMes: totals.monthlyCount,
    receitaMes: asNumber(totals.monthlyTotal),
    taxaAprovacao: totals.reviewed > 0 ? totals.approved / totals.reviewed : null,
    outputLabel, outputHint, funnelOutputLabel, pedidosPorDia, topClientes,
    distribuicaoConfianca: distr, funnel, atividade,
    distribuicaoIva: [...ivaCounts.entries()].sort((a, b) => b[1] - a[1]).map(([rate, count]) => ({ rate, count })),
  };
}
