import { NextResponse } from 'next/server';
import { renderProformaPdf } from '@/lib/emission/pdf-proforma';
import { requireDraftOwnership } from '@/lib/auth/tenant';
import type { ProformaItem } from '@/lib/emission/pdf-proforma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  let draft, tenant;
  try {
    ({ draft, tenant } = await requireDraftOwnership(id));
  } catch {
    return new NextResponse('Não autorizado', { status: 401 });
  }

  if (!draft.proformaNumero) {
    return new NextResponse(
      'Este draft ainda não foi emitido como proforma.',
      { status: 404 },
    );
  }

  const items = (draft.items as ProformaItem[] | null) ?? [];
  if (items.length === 0) {
    return new NextResponse('Draft sem itens', { status: 422 });
  }

  const buffer = await renderProformaPdf({
    numero: draft.proformaNumero,
    data: draft.emittedAt ?? draft.createdAt ?? new Date(),
    emitente: {
      nome: tenant.nome,
      nif: tenant.empresaNif,
      morada: tenant.empresaMorada,
      email: null,
      iban: tenant.empresaIban,
    },
    cliente: {
      nome: draft.clienteNome ?? 'Cliente sem nome',
      nif: draft.clienteNif,
      email: draft.clienteEmail,
      morada: draft.clienteMorada,
    },
    items,
    observacoes: draft.observacoes,
    prazoPagamento: draft.prazoPagamento,
  });

  const filename = `proforma-${String(draft.proformaNumero).padStart(6, '0')}.pdf`;

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
