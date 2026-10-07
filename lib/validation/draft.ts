import Decimal from 'decimal.js';
import { calculateTotals, type InvoiceItem } from '@/lib/faturas/totals';
import { isValidNifPt } from './nif-pt';
import { isValidIbanPt } from './iban-pt';

export const MAX_DRAFT_ITEMS = 100;
const MAX_AMOUNT = 99_999_999.99;
const TEXT_LIMITS = {
  clienteNome: 200, clienteNif: 32, clienteEmail: 254, clienteMorada: 1000,
  iban: 64, prazoPagamento: 200, observacoes: 4000,
} as const;
type TextField = keyof typeof TEXT_LIMITS;
export type DraftPatch = Partial<Record<TextField, string | null>> & { items?: InvoiceItem[] };
export type DraftActionResult = { ok: true } | { ok: false; error: string };

export class DraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DraftValidationError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DraftValidationError('Dados do draft inválidos.');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) {
    throw new DraftValidationError(`Texto inválido ou demasiado longo (máximo ${max} caracteres).`);
  }
  return value.trim() || null;
}

function number(value: unknown, label: string, max: number, decimals: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || new Decimal(value).decimalPlaces() > decimals) {
    throw new DraftValidationError(`${label} inválido: usa um valor igual ou superior a zero com até ${decimals} casas decimais.`);
  }
  return value;
}

export function parseDraftItems(value: unknown): InvoiceItem[] {
  if (!Array.isArray(value) || value.length > MAX_DRAFT_ITEMS) {
    throw new DraftValidationError(`O draft permite até ${MAX_DRAFT_ITEMS} linhas.`);
  }
  const items = value.map((input) => {
    const item = record(input);
    if (typeof item.descricao !== 'string') throw new DraftValidationError('Descrição da linha inválida.');
    return {
      descricao: text(item.descricao, 1000) ?? '',
      quantidade: number(item.quantidade, 'Quantidade', 1_000_000, 4),
      preco_unitario: number(item.preco_unitario, 'Preço unitário', MAX_AMOUNT, 6),
      iva_percentagem: number(item.iva_percentagem, 'IVA', 100, 2),
    };
  });
  if (calculateTotals(items).total > MAX_AMOUNT) {
    throw new DraftValidationError('O total excede o limite suportado pelo documento.');
  }
  return items;
}

export function parseDraftPatch(input: unknown): DraftPatch {
  const data = record(input);
  const patch: DraftPatch = {};
  for (const key of Object.keys(data)) {
    if (key === 'items') {
      patch.items = parseDraftItems(data.items);
    } else if (Object.hasOwn(TEXT_LIMITS, key)) {
      const field = key as TextField;
      patch[field] = text(data[field], TEXT_LIMITS[field]);
    } else if (['subtotal', 'ivaValor', 'total'].includes(key) && Object.hasOwn(data, 'items')) {
      // Older open browser tabs still send totals. Never use those values.
      continue;
    } else {
      throw new DraftValidationError('Este campo não pode ser alterado.');
    }
  }
  if (!Object.keys(patch).length) throw new DraftValidationError('Não há alterações para guardar.');
  return patch;
}

export function validateDraftForReview(input: {
  clienteNome: string | null; clienteNif: string | null; clienteEmail: string | null;
  iban: string | null; items: unknown;
}): InvoiceItem[] {
  if (!input.clienteNome?.trim()) throw new DraftValidationError('Preenche o nome do cliente antes de aprovar ou emitir.');
  if (input.clienteNif && !isValidNifPt(input.clienteNif)) throw new DraftValidationError('NIF do cliente inválido.');
  if (input.clienteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.clienteEmail)) throw new DraftValidationError('Email do cliente inválido.');
  if (input.iban && !isValidIbanPt(input.iban)) throw new DraftValidationError('IBAN inválido.');
  const items = parseDraftItems(input.items);
  if (!items.length) throw new DraftValidationError('Adiciona pelo menos uma linha antes de aprovar ou emitir.');
  if (items.some((item) => !item.descricao.trim() || item.quantidade <= 0)) {
    throw new DraftValidationError('Todas as linhas precisam de descrição e quantidade superior a zero.');
  }
  return items;
}

export function parseExtractedDraft(input: unknown) {
  const data = record(input);
  const items = parseDraftItems(data.items);
  const fields: Record<TextField, string | null> = {
    clienteNome: text(data.cliente_nome, TEXT_LIMITS.clienteNome),
    clienteNif: text(data.cliente_nif, TEXT_LIMITS.clienteNif),
    clienteEmail: text(data.cliente_email, TEXT_LIMITS.clienteEmail),
    clienteMorada: text(data.cliente_morada, TEXT_LIMITS.clienteMorada),
    iban: text(data.iban, TEXT_LIMITS.iban),
    prazoPagamento: text(data.prazo_pagamento, TEXT_LIMITS.prazoPagamento),
    observacoes: text(data.observacoes, TEXT_LIMITS.observacoes),
  };
  const confidence = data.confianca_extracao;
  if (confidence !== 'alta' && confidence !== 'media' && confidence !== 'baixa') {
    throw new DraftValidationError('Confiança da extração inválida.');
  }
  const totals = calculateTotals(items);
  const supplied = [data.subtotal, data.iva_valor, data.total];
  for (const amount of supplied) {
    if (amount !== undefined && amount !== null) number(amount, 'Total extraído', MAX_AMOUNT, 6);
  }
  const discrepancy = supplied.some((amount, index) => typeof amount === 'number' &&
    new Decimal(amount).minus([totals.subtotal, totals.ivaValor, totals.total][index]).abs().gte(0.02));
  const incomplete = !fields.clienteNome || !items.length || items.some((item) => !item.descricao || item.quantidade === 0);
  const notes = [text(data.notas_extracao, 4000),
    discrepancy ? 'Os totais extraídos diferem das linhas. Valores recalculados; confirma o documento original.' : null,
    incomplete ? 'Faltam dados obrigatórios para aprovar ou emitir.' : null,
  ].filter(Boolean).join('\n');
  return {
    cliente_nome: fields.clienteNome, cliente_nif: fields.clienteNif,
    cliente_email: fields.clienteEmail, cliente_morada: fields.clienteMorada,
    items, subtotal: items.length ? totals.subtotal : null,
    iva_valor: items.length ? totals.ivaValor : null, total: items.length ? totals.total : null,
    iban: fields.iban, prazo_pagamento: fields.prazoPagamento, observacoes: fields.observacoes,
    confianca_extracao: (discrepancy || incomplete ? 'baixa' : confidence) as 'alta' | 'media' | 'baixa',
    notas_extracao: notes,
  };
}
