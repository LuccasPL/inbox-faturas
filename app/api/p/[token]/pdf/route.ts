import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { faturasDraft, tenants } from '@/lib/db/schema';
import { renderProformaPdf } from '@/lib/emission/pdf-proforma';
import type { ProformaItem } from '@/lib/emission/pdf-proforma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Endpoint público que serve o PDF da proforma a quem tem o token.
 * Sem auth, mas precisa do token (gerado e partilhado pelo owner).
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;
  if (!token || token.length < 16) {
    return new NextResponse('Token inválido', { status: 400 });
  }

  const [row] = await db
    .select({ draft: faturasDraft, tenant: tenants })
    .from(faturasDraft)
    .innerJoin(tenants, eq(tenants.id, faturasDraft.tenantId))
    .where(eq(faturasDraft.proformaShareToken, token))
    .limit(1);

  if (!row?.draft || row.draft.status !== 'emitida_proforma' || !row.draft.proformaNumero) {
    return new NextResponse('Proforma não encontrada', { status: 404 });
  }

  const items = (row.draft.items as ProformaItem[] | null) ?? [];
  if (items.length === 0) {
    return new NextResponse('Proforma sem itens', { status: 422 });
  }

  const buffer = await renderProformaPdf({
    numero: row.draft.proformaNumero,
    data: row.draft.emittedAt ?? row.draft.createdAt ?? new Date(),
    emitente: {
      nome: row.tenant.nome,
      nif: row.tenant.empresaNif,
      morada: row.tenant.empresaMorada,
      email: row.tenant.emailInbound,
      iban: row.tenant.empresaIban,
    },
    cliente: {
      nome: row.draft.clienteNome ?? 'Cliente sem nome',
      nif: row.draft.clienteNif,
      email: row.draft.clienteEmail,
      morada: row.draft.clienteMorada,
    },
    items,
    observacoes: row.draft.observacoes,
    prazoPagamento: row.draft.prazoPagamento,
  });

  const filename = `proforma-${String(row.draft.proformaNumero).padStart(6, '0')}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': buffer.length.toString(),
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
