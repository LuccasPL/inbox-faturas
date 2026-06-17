import { NextResponse } from 'next/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { getTenantForUser } from '@/lib/auth/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONCLUIDO_STATUSES = [
  'aprovado',
  'rascunho_moloni',
  'emitida',
  'emitida_proforma',
  'rejeitado',
] as const;

const HEADERS = [
  'data_criacao',
  'cliente_nome',
  'cliente_nif',
  'cliente_email',
  'subtotal_eur',
  'iva_eur',
  'total_eur',
  'status',
  'emitida_via',
  'moloni_document_id',
  'proforma_numero',
  'emitida_em',
  'proforma_enviada_em',
  'email_origem',
] as const;

/**
 * Exporta as faturas concluídas do tenant em CSV (RFC 4180).
 * Quoting em todos os campos string para evitar problemas com vírgulas/quebras.
 */
export async function GET(): Promise<Response> {
  const tenant = await getTenantForUser();
  if (!tenant) {
    return new NextResponse('Não autorizado', { status: 401 });
  }

  const rows = await db
    .select({ draft: faturasDraft, email: emails })
    .from(faturasDraft)
    .leftJoin(emails, eq(emails.id, faturasDraft.emailId))
    .where(
      and(
        eq(faturasDraft.tenantId, tenant.id),
        inArray(faturasDraft.status, [...CONCLUIDO_STATUSES]),
      ),
    )
    .orderBy(
      desc(
        sql`coalesce(${faturasDraft.emittedAt}, ${faturasDraft.reviewedAt}, ${faturasDraft.createdAt})`,
      ),
    );

  const lines: string[] = [HEADERS.join(',')];

  for (const { draft, email } of rows) {
    lines.push(
      [
        toIso(draft.createdAt),
        csv(draft.clienteNome),
        csv(draft.clienteNif),
        csv(draft.clienteEmail),
        formatNum(draft.subtotal),
        formatNum(draft.ivaValor),
        formatNum(draft.total),
        csv(draft.status),
        csv(draft.emittedVia),
        draft.moloniDocumentId ?? '',
        draft.proformaNumero ?? '',
        toIso(draft.emittedAt),
        toIso(draft.proformaSentAt),
        csv(email?.fromEmail ?? null),
      ].join(','),
    );
  }

  const filename = `inbox-faturas-documentos-concluidos-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  // BOM para Excel pt-PT abrir com acentos certos
  const body = '﻿' + lines.join('\r\n') + '\r\n';

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

function csv(v: string | null | undefined): string {
  if (v === null || v === undefined) return '';
  const escaped = v.replace(/"/g, '""');
  return `"${escaped}"`;
}

function toIso(v: Date | null | undefined): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function formatNum(v: string | number | null): string {
  if (v === null || v === undefined) return '';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return '';
  // Ponto como decimal separator para máxima portabilidade
  return n.toFixed(2);
}
