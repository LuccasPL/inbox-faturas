import { and, count, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';

const CONCLUIDO_STATUSES = [
  'aprovado',
  'rascunho_moloni',
  'emitida',
  'emitida_proforma',
] as const;
const FALHA_STATUSES = ['falha_emissao'] as const;
type EmissionMode = 'moloni' | 'pdf_proforma';

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
}

export interface ActivityItem {
  id: string;
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
  topClientes: { nome: string; total: number; count: number }[];
  distribuicaoConfianca: { alta: number; media: number; baixa: number };
  funnel: FunnelStage[];
  atividade: ActivityItem[];
  distribuicaoIva: IvaSlice[];
}

function startOfMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function daysAgo(n: number, now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function asNumber(v: string | number | null): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'string' ? parseFloat(v) : v;
}

/**
 * Carrega métricas agregadas para o dashboard do tenant.
 */
export async function loadDashboard(
  tenantId: string,
  emissionMode: EmissionMode,
): Promise<DashboardData> {
  const inicioMes = startOfMonth();
  const inicio30Dias = daysAgo(29);
  const outputStatus =
    emissionMode === 'pdf_proforma' ? 'emitida_proforma' : 'emitida';
  const outputLabel =
    emissionMode === 'pdf_proforma' ? 'Proformas (mês)' : 'Emitidas (mês)';
  const outputHint =
    emissionMode === 'pdf_proforma'
      ? 'proformas emitidas pela app'
      : 'documentos no Moloni';
  const funnelOutputLabel =
    emissionMode === 'pdf_proforma' ? 'Proformas emitidas' : 'Emitidas';

  /* -------------------------- Por rever ---------------------------------- */
  const porReverRow = await db
    .select({ value: count() })
    .from(emails)
    .leftJoin(faturasDraft, eq(faturasDraft.emailId, emails.id))
    .where(
      and(
        eq(emails.tenantId, tenantId),
        sql`(${emails.isFaturaRequest} in ('sim','incerto') or ${emails.isFaturaRequest} is null)`,
        sql`(${faturasDraft.status} is null or ${faturasDraft.status} in ('pendente_revisao','falha_emissao'))`,
      ),
    );

  /* ----------------------- Emitidas / receita mês ------------------------ */
  const emitidasMesRows = await db
    .select({
      value: count(),
      sum: sql<string>`coalesce(sum(${faturasDraft.total}), 0)`,
    })
    .from(faturasDraft)
    .where(
      and(
        eq(faturasDraft.tenantId, tenantId),
        eq(faturasDraft.status, outputStatus),
        sql`coalesce(${faturasDraft.emittedAt}, ${faturasDraft.createdAt}) >= ${inicioMes}`,
      ),
    );

  /* --------------------------- Taxa aprovação ---------------------------- */
  const totalRevistosRow = await db
    .select({ value: count() })
    .from(faturasDraft)
    .where(
      and(
        eq(faturasDraft.tenantId, tenantId),
        inArray(faturasDraft.status, [
          'aprovado',
          'rascunho_moloni',
          'emitida',
          'emitida_proforma',
          'rejeitado',
        ]),
      ),
    );

  const totalAprovadosRow = await db
    .select({ value: count() })
    .from(faturasDraft)
    .where(
      and(
        eq(faturasDraft.tenantId, tenantId),
        inArray(faturasDraft.status, [...CONCLUIDO_STATUSES]),
      ),
    );

  const totalRevistos = totalRevistosRow[0]?.value ?? 0;
  const totalAprovados = totalAprovadosRow[0]?.value ?? 0;
  const taxaAprovacao =
    totalRevistos > 0 ? totalAprovados / totalRevistos : null;

  /* ----------------------- Pedidos por dia (30d) ------------------------- */
  const porDiaRows = await db
    .select({
      date: sql<string>`to_char(${emails.createdAt}::date, 'YYYY-MM-DD')`,
      value: count(),
    })
    .from(emails)
    .where(
      and(
        eq(emails.tenantId, tenantId),
        gte(emails.createdAt, inicio30Dias),
      ),
    )
    .groupBy(sql`${emails.createdAt}::date`)
    .orderBy(sql`${emails.createdAt}::date asc`);

  const porDiaMap = new Map(porDiaRows.map((r) => [r.date, r.value]));
  const pedidosPorDia: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = daysAgo(i);
    const key = d.toISOString().slice(0, 10);
    pedidosPorDia.push({ date: key, count: porDiaMap.get(key) ?? 0 });
  }

  /* --------------------------- Top clientes ------------------------------ */
  const topClientesRows = await db
    .select({
      nome: faturasDraft.clienteNome,
      total: sql<string>`coalesce(sum(${faturasDraft.total}), 0)`,
      n: count(),
    })
    .from(faturasDraft)
    .where(
      and(
        eq(faturasDraft.tenantId, tenantId),
        inArray(faturasDraft.status, [...CONCLUIDO_STATUSES]),
        isNotNull(faturasDraft.clienteNome),
      ),
    )
    .groupBy(faturasDraft.clienteNome)
    .orderBy(desc(sql`sum(${faturasDraft.total})`))
    .limit(5);

  const topClientes = topClientesRows.map((r) => ({
    nome: r.nome ?? '—',
    total: asNumber(r.total),
    count: r.n,
  }));

  /* ------------------------ Distribuição confiança ----------------------- */
  const distrRows = await db
    .select({
      key: faturasDraft.confiancaExtracao,
      value: count(),
    })
    .from(faturasDraft)
    .where(
      and(
        eq(faturasDraft.tenantId, tenantId),
        isNotNull(faturasDraft.confiancaExtracao),
      ),
    )
    .groupBy(faturasDraft.confiancaExtracao);

  const distrMap = Object.fromEntries(distrRows.map((r) => [r.key, r.value]));
  const distribuicaoConfianca = {
    alta: distrMap.alta ?? 0,
    media: distrMap.media ?? 0,
    baixa: distrMap.baixa ?? 0,
  };

  /* -------------------------------- Funnel ------------------------------- */
  const [recebidosRow] = await db
    .select({ value: count() })
    .from(emails)
    .where(eq(emails.tenantId, tenantId));

  const [triagemPositivaRow] = await db
    .select({ value: count() })
    .from(emails)
    .where(
      and(
        eq(emails.tenantId, tenantId),
        sql`${emails.isFaturaRequest} in ('sim','incerto')`,
      ),
    );

  const [draftsCriadosRow] = await db
    .select({ value: count() })
    .from(faturasDraft)
    .where(eq(faturasDraft.tenantId, tenantId));

  const [aprovadosRow] = await db
    .select({ value: count() })
    .from(faturasDraft)
    .where(
      and(
        eq(faturasDraft.tenantId, tenantId),
        inArray(faturasDraft.status, [...CONCLUIDO_STATUSES]),
      ),
    );

  const [emitidasRow] = await db
    .select({ value: count() })
    .from(faturasDraft)
    .where(
      and(
        eq(faturasDraft.tenantId, tenantId),
        eq(faturasDraft.status, outputStatus),
      ),
    );

  const funnel: FunnelStage[] = [
    { key: 'recebidos', label: 'Emails recebidos', value: recebidosRow?.value ?? 0 },
    { key: 'triagem', label: 'Triagem positiva', value: triagemPositivaRow?.value ?? 0 },
    { key: 'drafts', label: 'Drafts extraídos', value: draftsCriadosRow?.value ?? 0 },
    { key: 'aprovados', label: 'Aprovados', value: aprovadosRow?.value ?? 0 },
    {
      key: 'emitidas',
      label: funnelOutputLabel,
      value: emitidasRow?.value ?? 0,
    },
  ];

  /* ------------------------------ Atividade ------------------------------ */
  const ultimosDrafts = await db
    .select({
      id: faturasDraft.id,
      emailId: faturasDraft.emailId,
      status: faturasDraft.status,
      clienteNome: faturasDraft.clienteNome,
      total: faturasDraft.total,
      reviewedAt: faturasDraft.reviewedAt,
      emittedAt: faturasDraft.emittedAt,
      createdAt: faturasDraft.createdAt,
    })
    .from(faturasDraft)
    .where(eq(faturasDraft.tenantId, tenantId))
    .orderBy(
      desc(
        sql`coalesce(${faturasDraft.emittedAt}, ${faturasDraft.reviewedAt}, ${faturasDraft.createdAt})`,
      ),
    )
    .limit(8);

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
      kind: 'draft' as const,
      status,
      label,
      detail: d.clienteNome,
      total: d.total === null ? null : asNumber(d.total),
      at,
    };
  });

  /* ---------------------------- Distribuição IVA ------------------------- */
  const draftsComItems = await db
    .select({ items: faturasDraft.items })
    .from(faturasDraft)
    .where(
      and(
        eq(faturasDraft.tenantId, tenantId),
        inArray(faturasDraft.status, [...CONCLUIDO_STATUSES]),
      ),
    )
    .orderBy(desc(faturasDraft.createdAt))
    .limit(50);

  const ivaCounts = new Map<number, number>();
  for (const { items } of draftsComItems) {
    if (!Array.isArray(items)) continue;
    for (const it of items as Array<{ iva_percentagem?: number }>) {
      const rateRaw = it.iva_percentagem;
      const rate =
        typeof rateRaw === 'number' && Number.isFinite(rateRaw)
          ? Math.round(rateRaw)
          : 23;
      ivaCounts.set(rate, (ivaCounts.get(rate) ?? 0) + 1);
    }
  }
  const distribuicaoIva: IvaSlice[] = [...ivaCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rate, c]) => ({ rate, count: c }));

  // silence unused (FALHA_STATUSES reservado para uso futuro)
  void FALHA_STATUSES;

  return {
    porRever: porReverRow[0]?.value ?? 0,
    emitidasMes: emitidasMesRows[0]?.value ?? 0,
    receitaMes: asNumber(emitidasMesRows[0]?.sum ?? null),
    taxaAprovacao,
    outputLabel,
    outputHint,
    funnelOutputLabel,
    pedidosPorDia,
    topClientes,
    distribuicaoConfianca,
    funnel,
    atividade,
    distribuicaoIva,
  };
}
