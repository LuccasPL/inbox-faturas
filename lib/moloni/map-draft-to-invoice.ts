import type { InvoiceInsert, DocumentProductInput } from './types';

/**
 * Item extraído pela IA do email. Espelho do que vai dentro de
 * faturas_draft.items (JSONB).
 */
export interface DraftItem {
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  iva_percentagem?: number;
}

export interface DraftInput {
  items: DraftItem[] | null;
  observacoes: string | null;
  prazoPagamento: string | null;  // texto livre (ex: "30 dias", "imediato")
}

export interface TenantSettings {
  documentSetId: number;
  fallbackProductId: number;
  // dias para vencimento se não conseguirmos parsear o prazo do draft
  defaultDueDays?: number;
}

/**
 * Faz parse de strings como "30 dias", "15 dias", "imediato".
 * Devolve número de dias. Default 30 se não conseguir parsear.
 */
function parsePrazoEmDias(prazo: string | null, fallback: number): number {
  if (!prazo) return fallback;
  const lower = prazo.toLowerCase().trim();
  if (lower.includes('imediat') || lower === 'pronto pagamento') return 0;
  const m = lower.match(/(\d+)\s*dia/);
  if (m) return parseInt(m[1], 10);
  return fallback;
}

/**
 * Mapeia um faturas_draft + settings do tenant para o input do
 * invoiceCreate do Moloni. Cria como DRAFT (status=0) por defeito.
 */
export function mapDraftToInvoice(
  draft: DraftInput,
  customerId: number,
  settings: TenantSettings,
  opts: { finalize?: boolean } = {},
): InvoiceInsert {
  const items = draft.items ?? [];
  if (items.length === 0) {
    throw new Error('Draft sem itens — nada para faturar');
  }

  const now = new Date();
  const dueDays = parsePrazoEmDias(
    draft.prazoPagamento,
    settings.defaultDueDays ?? 30,
  );
  const expiration = new Date(now);
  expiration.setDate(expiration.getDate() + dueDays);

  const products: DocumentProductInput[] = items.map((item, idx) => ({
    productId: settings.fallbackProductId,
    qty: item.quantidade,
    ordering: idx + 1,
    price: item.preco_unitario,
    summary: item.descricao.slice(0, 200),
  }));

  return {
    documentSetId: settings.documentSetId,
    customerId,
    date: now.toISOString(),
    expirationDate: expiration.toISOString().slice(0, 10),
    status: opts.finalize ? 1 : 0,
    products,
    notes: draft.observacoes ?? undefined,
  };
}
