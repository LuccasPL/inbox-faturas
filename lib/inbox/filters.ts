export const INBOX_PAGE_SIZE = 25;
export const INBOX_QUERY_MAX_LENGTH = 120;

export const INBOX_TABS = [
  { value: 'por-rever', label: 'Por rever' },
  { value: 'concluidas', label: 'Concluídas' },
  { value: 'ignorados', label: 'Ignorados' },
] as const;

export type InboxTab = (typeof INBOX_TABS)[number]['value'];
export type InboxSearchParams = Record<string, string | string[] | undefined>;

export const INBOX_STATUS_OPTIONS: Record<InboxTab, readonly { value: string; label: string }[]> = {
  'por-rever': [
    { value: 'incerto', label: 'Triagem incerta' },
    { value: 'pendente_revisao', label: 'Pendente de revisão' },
    { value: 'queued', label: 'Em fila' },
    { value: 'retry_wait', label: 'Nova tentativa agendada' },
    { value: 'processing', label: 'Em processamento' },
    { value: 'extraction_failed', label: 'Extração falhada' },
    { value: 'falha_emissao', label: 'Falha de emissão' },
    { value: 'emissao_em_curso', label: 'Emissão em curso' },
  ],
  concluidas: [
    { value: 'aprovado', label: 'Aprovadas' },
    { value: 'rascunho_moloni', label: 'Rascunhos Moloni' },
    { value: 'emitida', label: 'Emitidas no Moloni' },
    { value: 'emitida_proforma', label: 'Proformas emitidas' },
    { value: 'rejeitado', label: 'Rejeitadas' },
  ],
  ignorados: [],
};

export interface InboxFilters {
  tab: InboxTab;
  q: string;
  status: string;
  priority: InboxPriority | '';
  from: string;
  to: string;
  page: number;
  dateError: string | null;
}

function single(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01' || value > '9998-12-31') return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseInboxFilters(params: InboxSearchParams = {}): InboxFilters {
  const requestedTab = single(params.tab);
  const tab = INBOX_TABS.find((item) => item.value === requestedTab)?.value ?? 'por-rever';
  const requestedStatus = single(params.status);
  const status = INBOX_STATUS_OPTIONS[tab].some((item) => item.value === requestedStatus) ? requestedStatus : '';
  const priority = INBOX_PRIORITIES.find(item => item.tab === tab && item.id === single(params.priority))?.id ?? '';
  const rawFrom = single(params.from);
  const rawTo = single(params.to);
  const from = validDate(rawFrom) ? rawFrom : '';
  const to = validDate(rawTo) ? rawTo : '';
  const invalidDate = (rawFrom && !from) || (rawTo && !to) || Array.isArray(params.from) || Array.isArray(params.to);
  const dateError = invalidDate
    ? 'Indica datas de receção válidas.'
    : from && to && from > to ? 'A data inicial não pode ser posterior à data final.' : null;
  const rawPage = single(params.page);
  const page = /^[1-9]\d{0,14}$/.test(rawPage) ? Number(rawPage) : 1;

  return {
    tab, status, priority, from, to, page, dateError,
    q: single(params.q).trim().slice(0, INBOX_QUERY_MAX_LENGTH),
  };
}

export function hasInboxFilters(filters: InboxFilters): boolean {
  return !!(filters.q || filters.status || filters.priority || filters.from || filters.to || filters.dateError);
}

export function inboxHref(filters: InboxFilters, changes: Partial<InboxFilters> = {}): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.tab !== 'por-rever') params.set('tab', next.tab);
  if (next.q) params.set('q', next.q);
  if (next.status) params.set('status', next.status);
  if (next.priority) params.set('priority', next.priority);
  if (next.from) params.set('from', next.from);
  if (next.to) params.set('to', next.to);
  if (next.page > 1) params.set('page', String(next.page));
  const query = params.toString();
  return query ? `/inbox?${query}` : '/inbox';
}

export function inboxDetailHref(emailId: string, filters: InboxFilters): string {
  return `/inbox/${encodeURIComponent(emailId)}?returnTo=${encodeURIComponent(inboxHref(filters))}`;
}

export function safeInboxReturnHref(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || !value.startsWith('/inbox') || value.length > 2048) return '/inbox';
  try {
    const url = new URL(value, 'https://inbox.invalid');
    if (url.origin !== 'https://inbox.invalid' || url.pathname !== '/inbox') return '/inbox';
    const params: InboxSearchParams = {};
    for (const key of ['tab', 'q', 'status', 'priority', 'from', 'to', 'page']) {
      const values = url.searchParams.getAll(key);
      params[key] = values.length > 1 ? values : values[0];
    }
    return inboxHref(parseInboxFilters(params));
  } catch {
    return '/inbox';
  }
}
import { INBOX_PRIORITIES, type InboxPriority } from './priorities';
