import { and, desc, eq, inArray, isNotNull, max, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { faturasDraft } from '@/lib/db/schema';

const CONCLUIDO_STATUSES = [
  'aprovado',
  'rascunho_moloni',
  'emitida',
  'emitida_proforma',
] as const;

export interface ClienteAggregado {
  /** NIF normalizado; "sem-nif" para clientes sem NIF. */
  key: string;
  nif: string | null;
  nome: string;
  email: string | null;
  total: number;
  contagem: number;
  ultimaEm: Date | null;
}

function asNumber(v: string | number | null): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'string' ? parseFloat(v) : v;
}

/**
 * Lista clientes agregados (NIF como chave) com totais e última atividade.
 */
export async function listClientes(
  tenantId: string,
): Promise<ClienteAggregado[]> {
  // Vamos buscar todos os drafts concluídos com cliente identificado,
  // e agregar no lado da app — JSONB + condições por nif/nome são mais
  // simples de manter assim do que via SQL group by complexo.
  const rows = await db
    .select({
      nif: faturasDraft.clienteNif,
      nome: faturasDraft.clienteNome,
      email: faturasDraft.clienteEmail,
      total: faturasDraft.total,
      createdAt: faturasDraft.createdAt,
    })
    .from(faturasDraft)
    .where(
      and(
        eq(faturasDraft.tenantId, tenantId),
        inArray(faturasDraft.status, [...CONCLUIDO_STATUSES]),
        isNotNull(faturasDraft.clienteNome),
      ),
    )
    .orderBy(desc(faturasDraft.createdAt));

  const map = new Map<string, ClienteAggregado>();
  for (const r of rows) {
    const key = r.nif?.trim() || `sem-nif:${(r.nome ?? '').trim().toLowerCase()}`;
    const existing = map.get(key);
    const total = asNumber(r.total);
    if (existing) {
      existing.contagem += 1;
      existing.total += total;
      if (r.createdAt && (!existing.ultimaEm || r.createdAt > existing.ultimaEm)) {
        existing.ultimaEm = r.createdAt;
      }
      // Preferir o email mais recente quando o atual estiver vazio
      if (!existing.email && r.email) existing.email = r.email;
    } else {
      map.set(key, {
        key,
        nif: r.nif ?? null,
        nome: r.nome ?? '(sem nome)',
        email: r.email ?? null,
        total,
        contagem: 1,
        ultimaEm: r.createdAt ?? null,
      });
    }
  }

  return [...map.values()].sort((a, b) => b.total - a.total);
}

export interface ClienteDetalhe {
  nome: string;
  nif: string | null;
  email: string | null;
  morada: string | null;
  total: number;
  contagem: number;
  ultimaEm: Date | null;
  primeiroEm: Date | null;
  /** Distribuição IVA usada nas linhas. */
  ivaTipico: { rate: number; count: number }[];
  /** IBAN mais frequente. */
  ibanFrequente: string | null;
  /** Lista de drafts (últimos 50). */
  drafts: Array<{
    id: string;
    emailId: string | null;
    status: string;
    total: number | null;
    moloniDocumentId: number | null;
    proformaNumero: number | null;
    createdAt: Date | null;
  }>;
}

/**
 * Carrega detalhe de um cliente identificado por NIF (ou nome quando sem NIF).
 */
export async function loadClienteByKey(
  tenantId: string,
  key: string,
): Promise<ClienteDetalhe | null> {
  let condition;
  if (key.startsWith('sem-nif:')) {
    const nome = key.slice('sem-nif:'.length);
    condition = and(
      eq(faturasDraft.tenantId, tenantId),
      sql`lower(coalesce(${faturasDraft.clienteNome}, '')) = ${nome}`,
    );
  } else {
    condition = and(
      eq(faturasDraft.tenantId, tenantId),
      eq(faturasDraft.clienteNif, key),
    );
  }

  const drafts = await db
    .select()
    .from(faturasDraft)
    .where(condition)
    .orderBy(desc(faturasDraft.createdAt))
    .limit(50);

  if (drafts.length === 0) return null;

  let total = 0;
  let primeiroEm: Date | null = null;
  let ultimaEm: Date | null = null;
  let morada: string | null = null;
  let email: string | null = null;
  let nome = drafts[0].clienteNome ?? '(sem nome)';
  let nif = drafts[0].clienteNif ?? null;

  const ivaCounts = new Map<number, number>();
  const ibanCounts = new Map<string, number>();
  let confirmados = 0;

  for (const d of drafts) {
    const isConfirmado = [
      'aprovado',
      'rascunho_moloni',
      'emitida',
      'emitida_proforma',
    ].includes(d.status ?? '');
    if (isConfirmado) {
      total += asNumber(d.total);
      confirmados += 1;
    }
    if (d.createdAt) {
      if (!ultimaEm || d.createdAt > ultimaEm) ultimaEm = d.createdAt;
      if (!primeiroEm || d.createdAt < primeiroEm) primeiroEm = d.createdAt;
    }
    if (!morada && d.clienteMorada) morada = d.clienteMorada;
    if (!email && d.clienteEmail) email = d.clienteEmail;
    if (d.clienteNome) nome = d.clienteNome;
    if (d.clienteNif) nif = d.clienteNif;
    if (d.iban) {
      const v = d.iban.replace(/\s+/g, '');
      ibanCounts.set(v, (ibanCounts.get(v) ?? 0) + 1);
    }
    if (Array.isArray(d.items)) {
      for (const it of d.items as Array<{ iva_percentagem?: number }>) {
        const rate =
          typeof it.iva_percentagem === 'number'
            ? Math.round(it.iva_percentagem)
            : 23;
        ivaCounts.set(rate, (ivaCounts.get(rate) ?? 0) + 1);
      }
    }
  }

  const ivaTipico = [...ivaCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rate, count]) => ({ rate, count }));

  const ibanFrequente =
    [...ibanCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // silence unused (max kept for future)
  void max;

  return {
    nome,
    nif,
    email,
    morada,
    total,
    contagem: confirmados,
    ultimaEm,
    primeiroEm,
    ivaTipico,
    ibanFrequente,
    drafts: drafts.map((d) => ({
      id: d.id,
      emailId: d.emailId,
      status: d.status ?? 'pendente_revisao',
      total: d.total === null ? null : asNumber(d.total),
      moloniDocumentId: d.moloniDocumentId,
      proformaNumero: d.proformaNumero,
      createdAt: d.createdAt,
    })),
  };
}
