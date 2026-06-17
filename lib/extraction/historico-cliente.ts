import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';

/**
 * Shape compacto enviado ao Claude como referência.
 * Inclui só campos relevantes para a IA aprender padrões.
 */
export interface HistoricoCliente {
  cliente_nome: string | null;
  cliente_nif: string | null;
  cliente_email: string | null;
  cliente_morada: string | null;
  items: Array<{
    descricao: string;
    iva_percentagem: number;
  }>;
  prazo_pagamento: string | null;
  iban: string | null;
}

/**
 * Status que consideramos "confirmados pelo humano". Só estes alimentam
 * o histórico — drafts pendentes ou rejeitados não.
 */
const STATUS_CONFIRMADOS = [
  'aprovado',
  'rascunho_moloni',
  'emitida',
  'emitida_proforma',
];

/**
 * Procura os N mais recentes drafts confirmados do mesmo cliente
 * (identificado pelo email do remetente).
 *
 * @param excludeDraftId ignora este draft (útil no reprocessamento)
 */
export async function buscarHistoricoCliente(input: {
  tenantId: string;
  fromEmail: string;
  excludeDraftId?: string;
  limit?: number;
}): Promise<HistoricoCliente[]> {
  const { tenantId, fromEmail, excludeDraftId, limit = 3 } = input;

  const baseConditions = [
    eq(faturasDraft.tenantId, tenantId),
    eq(emails.fromEmail, fromEmail),
    inArray(faturasDraft.status, STATUS_CONFIRMADOS),
  ];

  if (excludeDraftId) {
    baseConditions.push(ne(faturasDraft.id, excludeDraftId));
  }

  const rows = await db
    .select({ draft: faturasDraft })
    .from(faturasDraft)
    .innerJoin(emails, eq(emails.id, faturasDraft.emailId))
    .where(and(...baseConditions))
    .orderBy(desc(faturasDraft.createdAt))
    .limit(limit);

  return rows.map(({ draft }) => {
    const items =
      (draft.items as Array<{
        descricao?: string;
        iva_percentagem?: number;
      }> | null) ?? [];

    return {
      cliente_nome: draft.clienteNome,
      cliente_nif: draft.clienteNif,
      cliente_email: draft.clienteEmail,
      cliente_morada: draft.clienteMorada,
      items: items.map((it) => ({
        descricao: it.descricao ?? '',
        iva_percentagem: it.iva_percentagem ?? 23,
      })),
      prazo_pagamento: draft.prazoPagamento,
      iban: draft.iban,
    };
  });
}
