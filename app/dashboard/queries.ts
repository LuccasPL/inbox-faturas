import { and, count, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';

const CONCLUIDO_STATUSES = ['aprovado', 'rascunho_moloni', 'emitida'] as const;
const FALHA_STATUSES = ['falha_emissao'] as const;

export interface DashboardData {
  porRever: number;
  emitidasMes: number;
  receitaMes: number;
  taxaAprovacao: number | null;
  pedidosPorDia: { date: string; count: number }[];
  topClientes: { nome: string; total: number; count: number }[];
  distribuicaoConfianca: { alta: number; media: number; baixa: number };
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
export async function loadDashboard(tenantId: string): Promise<DashboardData> {
  const inicioMes = startOfMonth();
  const inicio30Dias = daysAgo(29);

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
        eq(faturasDraft.status, 'emitida'),
        gte(faturasDraft.createdAt, inicioMes),
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

  // silence unused (FALHA_STATUSES reservado para uso futuro)
  void FALHA_STATUSES;

  return {
    porRever: porReverRow[0]?.value ?? 0,
    emitidasMes: emitidasMesRows[0]?.value ?? 0,
    receitaMes: asNumber(emitidasMesRows[0]?.sum ?? null),
    taxaAprovacao,
    pedidosPorDia,
    topClientes,
    distribuicaoConfianca,
  };
}
