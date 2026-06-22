import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { faturasDraft } from '@/lib/db/schema';

export interface ExtractedDraftData {
  cliente_nome: string | null;
  cliente_nif: string | null;
  cliente_email: string | null;
  cliente_morada: string | null;
  items: unknown;
  subtotal?: number | null;
  iva_valor?: number | null;
  total?: number | null;
  iban: string | null;
  prazo_pagamento: string | null;
  observacoes: string | null;
  confianca_extracao: string | null;
}

export function buildExtractedDraftValues(input: {
  emailId: string;
  tenantId: string;
  dados: ExtractedDraftData;
  rawResponse: unknown;
}): typeof faturasDraft.$inferInsert {
  const { emailId, tenantId, dados, rawResponse } = input;
  return {
    emailId,
    tenantId,
    clienteNome: dados.cliente_nome,
    clienteNif: dados.cliente_nif,
    clienteEmail: dados.cliente_email,
    clienteMorada: dados.cliente_morada,
    items: dados.items,
    subtotal: dados.subtotal?.toString(),
    ivaValor: dados.iva_valor?.toString(),
    total: dados.total?.toString(),
    iban: dados.iban,
    prazoPagamento: dados.prazo_pagamento,
    observacoes: dados.observacoes,
    confiancaExtracao: dados.confianca_extracao,
    rawIaResponse: rawResponse,
    status: 'pendente_revisao',
    reviewedAt: null,
    reviewedBy: null,
    dadosFinais: null,
    moloniDocumentId: null,
    moloniPdfUrl: null,
    emittedAt: null,
    emitError: null,
    emittedVia: null,
    proformaNumero: null,
    proformaSentAt: null,
    proformaSentTo: null,
  };
}

export async function replaceDraftForEmail(input: {
  emailId: string;
  tenantId: string;
  dados: ExtractedDraftData;
  rawResponse: unknown;
}): Promise<void> {
  const values = buildExtractedDraftValues(input);

  await db.transaction(async (tx) => {
    await tx
      .delete(faturasDraft)
      .where(
        and(
          eq(faturasDraft.emailId, input.emailId),
          eq(faturasDraft.tenantId, input.tenantId),
        ),
      );

    await tx.insert(faturasDraft).values(values);
  });
}
