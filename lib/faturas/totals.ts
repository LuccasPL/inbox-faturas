import Decimal from 'decimal.js';

const Money = Decimal.clone({ precision: 32, rounding: Decimal.ROUND_HALF_UP });

export interface InvoiceItem {
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  iva_percentagem: number;
}

export function calculateTotals(items: InvoiceItem[]) {
  let base = new Money(0);
  let tax = new Money(0);
  for (const item of items) {
    const line = new Money(item.quantidade ?? 0).times(item.preco_unitario ?? 0);
    base = base.plus(line);
    tax = tax.plus(line.times(item.iva_percentagem ?? 0).dividedBy(100));
  }
  const subtotal = base.toDecimalPlaces(2);
  const ivaValor = tax.toDecimalPlaces(2);
  // The payable amount must equal the two displayed, rounded components.
  return {
    subtotal: subtotal.toNumber(),
    ivaValor: ivaValor.toNumber(),
    total: subtotal.plus(ivaValor).toNumber(),
  };
}

export function calculateLineTotal(item: InvoiceItem, version: 1 | 2 = 2): number {
  if (version === 1) return (item.quantidade ?? 0) * (item.preco_unitario ?? 0);
  return new Money(item.quantidade).times(item.preco_unitario).toDecimalPlaces(2).toNumber();
}

export function calculationVersion(snapshot: unknown): 1 | 2 {
  return snapshot && typeof snapshot === 'object' && 'calculo_versao' in snapshot &&
    snapshot.calculo_versao === 2 ? 2 : 1;
}

export function calculateDocumentTotals(items: InvoiceItem[], version: 1 | 2) {
  if (version === 2) return calculateTotals(items);
  // Preserve the original PDF arithmetic for documents issued before version 2.
  let base = 0;
  let tax = 0;
  for (const item of items) {
    const line = (item.quantidade ?? 0) * (item.preco_unitario ?? 0);
    base += line;
    tax += line * ((item.iva_percentagem ?? 0) / 100);
  }
  return { subtotal: Math.round(base * 100) / 100, ivaValor: Math.round(tax * 100) / 100,
    total: Math.round((base + tax) * 100) / 100 };
}
