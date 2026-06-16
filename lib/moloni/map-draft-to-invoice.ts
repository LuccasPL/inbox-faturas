import type { InvoiceInsert, DocumentProductInput } from './types';

export interface DraftItem {
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  iva_percentagem?: number;
}

export interface DraftInput {
  items: DraftItem[] | null;
  observacoes: string | null;
  prazoPagamento: string | null;
}

export type SupportedIvaRate = 0 | 6 | 13 | 23;

export interface TenantSettings {
  documentSetId: number;
  fallbackProductId: number;
  taxIdsByRate: Partial<Record<SupportedIvaRate, number>>;
  defaultDueDays?: number;
}

function parsePrazoEmDias(prazo: string | null, fallback: number): number {
  if (!prazo) return fallback;
  const lower = prazo.toLowerCase().trim();
  if (lower.includes('imediat') || lower === 'pronto pagamento') return 0;
  const m = lower.match(/(\d+)\s*dia/);
  if (m) return parseInt(m[1], 10);
  return fallback;
}

function normalizeIvaRate(value: number | undefined): SupportedIvaRate {
  const rate = Math.round(value ?? 23);
  if (rate === 0 || rate === 6 || rate === 13 || rate === 23) return rate;
  throw new Error(`Taxa de IVA nao suportada: ${value}%`);
}

function resolveTaxId(
  item: DraftItem,
  settings: TenantSettings,
): { taxId: number; value: SupportedIvaRate } {
  const rate = normalizeIvaRate(item.iva_percentagem);
  const taxId = settings.taxIdsByRate[rate];
  if (!taxId) {
    throw new Error(
      `Taxa IVA ${rate}% sem taxId Moloni configurado. Define MOLONI_TAX_ID_${rate}.`,
    );
  }
  return { taxId, value: rate };
}

export function mapDraftToInvoice(
  draft: DraftInput,
  customerId: number,
  settings: TenantSettings,
  opts: { finalize?: boolean } = {},
): InvoiceInsert {
  const items = draft.items ?? [];
  if (items.length === 0) {
    throw new Error('Draft sem itens - nada para faturar');
  }

  const now = new Date();
  const dueDays = parsePrazoEmDias(
    draft.prazoPagamento,
    settings.defaultDueDays ?? 30,
  );
  const expiration = new Date(now);
  expiration.setDate(expiration.getDate() + dueDays);

  const products: DocumentProductInput[] = items.map((item, idx) => {
    const tax = resolveTaxId(item, settings);
    return {
      productId: settings.fallbackProductId,
      qty: item.quantidade,
      ordering: idx + 1,
      price: item.preco_unitario,
      summary: item.descricao.slice(0, 200),
      taxes: [
        {
          taxId: tax.taxId,
          value: tax.value,
          ordering: 1,
          cumulative: false,
        },
      ],
    };
  });

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
