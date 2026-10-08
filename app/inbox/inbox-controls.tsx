import Form from 'next/form';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ListFilter, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { INBOX_PRIORITIES } from '@/lib/inbox/priorities';
import {
  INBOX_QUERY_MAX_LENGTH, INBOX_STATUS_OPTIONS, INBOX_TABS,
  INBOX_PAGE_SIZE, inboxHref, parseInboxFilters,
  type InboxFilters, type InboxTab,
} from '@/lib/inbox/filters';

const formatCount = (value: number) => value.toLocaleString('pt-PT');

export function InboxNavigation({ filters, counts }: {
  filters: InboxFilters;
  counts: Record<InboxTab, number>;
}) {
  return (
    <nav aria-label="Grupos da inbox" className="grid grid-cols-3 border-b">
      {INBOX_TABS.map((tab) => (
        <Link
          key={tab.value}
          href={inboxHref(filters, { tab: tab.value, status: '', priority: '', page: 1 })}
          prefetch={false}
          scroll={false}
          aria-current={filters.tab === tab.value ? 'page' : undefined}
          className={`flex min-w-0 flex-col items-center justify-center gap-1 border-b-2 px-2 py-3 text-xs font-medium transition-colors sm:flex-row sm:gap-2 sm:text-sm ${filters.tab === tab.value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
        >
          <span>{tab.label}</span>
          <span className="max-w-full rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">
            {formatCount(counts[tab.value])}
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function InboxFilterBar({ filters }: { filters: InboxFilters }) {
  const statuses = INBOX_STATUS_OPTIONS[filters.tab];
  const priorities = INBOX_PRIORITIES.filter(priority => priority.tab === filters.tab);
  const clearHref = inboxHref(parseInboxFilters({ tab: filters.tab }));
  return (
    <div key={inboxHref(filters)}>
      <Form action="/inbox" scroll={false} prefetch={false} className="grid grid-cols-2 items-end gap-3 lg:grid-cols-4">
        <input type="hidden" name="tab" value={filters.tab} />
        <label className="col-span-2 grid min-w-0 gap-1.5 text-xs font-medium">
          Pesquisar
          <span className="relative block min-w-0">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input name="q" type="search" defaultValue={filters.q} maxLength={INBOX_QUERY_MAX_LENGTH} placeholder="Cliente, email, assunto ou NIF" className="h-9 pl-9 font-normal" />
          </span>
        </label>
        <div className="col-span-2 grid min-w-0 gap-1.5 text-xs font-medium lg:col-span-1">
          <label htmlFor="inbox-status">Estado</label>
          <select id="inbox-status" name="status" defaultValue={filters.status} disabled={statuses.length === 0} className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-xs font-normal outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:bg-muted disabled:text-muted-foreground">
            <option value="">{statuses.length === 0 ? 'Ignorados pela triagem' : 'Todos os estados'}</option>
            {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </div>
        <div className="col-span-2 grid min-w-0 gap-1.5 text-xs font-medium lg:col-span-1">
          <label htmlFor="inbox-priority">Prioridade</label>
          <select id="inbox-priority" name="priority" defaultValue={filters.priority} disabled={priorities.length === 0} className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-xs font-normal outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:bg-muted disabled:text-muted-foreground">
            <option value="">{priorities.length ? 'Todas as prioridades' : 'Sem prioridades neste grupo'}</option>
            {priorities.map(priority => <option key={priority.id} value={priority.id}>{priority.filterLabel}</option>)}
          </select>
        </div>
        <label className="col-span-2 grid min-w-0 gap-1.5 text-xs font-medium min-[380px]:col-span-1">
          Recebido desde
          <Input name="from" type="date" defaultValue={filters.from} min="1000-01-01" max={filters.to || '9998-12-31'} className="h-9 max-w-full" />
        </label>
        <label className="col-span-2 grid min-w-0 gap-1.5 text-xs font-medium min-[380px]:col-span-1">
          Recebido até
          <Input name="to" type="date" defaultValue={filters.to} min={filters.from || '1000-01-01'} max="9998-12-31" className="h-9 max-w-full" />
        </label>
        <div className="col-span-2 flex items-center gap-2 lg:justify-end">
          <Button type="submit" size="lg" className="flex-1 lg:flex-none">
            <ListFilter aria-hidden /> Filtrar
          </Button>
          <Button asChild variant="ghost" size="icon-lg">
            <Link href={clearHref} prefetch={false} scroll={false} aria-label="Limpar filtros" title="Limpar filtros">
              <X aria-hidden />
            </Link>
          </Button>
        </div>
      </Form>
      {filters.dateError && <p role="alert" className="mt-3 text-sm text-destructive">{filters.dateError}</p>}
    </div>
  );
}

export function InboxPagination({ filters, total, page, totalPages, shown }: {
  filters: InboxFilters; total: number; page: number; totalPages: number; shown: number;
}) {
  if (total === 0) return null;
  const first = shown ? (page - 1) * INBOX_PAGE_SIZE + 1 : 0;
  const last = shown ? first + shown - 1 : 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t py-4">
      <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
        {formatCount(first)}–{formatCount(last)} de {formatCount(total)} {total === 1 ? 'resultado' : 'resultados'}
      </p>
      <nav aria-label="Paginação da inbox" className="flex items-center gap-2 max-[380px]:w-full max-[380px]:justify-between">
        <PageButton enabled={page > 1} href={inboxHref(filters, { page: page - 1 })} label="Página anterior"><ChevronLeft aria-hidden /></PageButton>
        <span className="min-w-20 text-center text-xs tabular-nums">{formatCount(page)} / {formatCount(totalPages)}</span>
        <PageButton enabled={page < totalPages} href={inboxHref(filters, { page: page + 1 })} label="Página seguinte"><ChevronRight aria-hidden /></PageButton>
      </nav>
    </div>
  );
}

function PageButton({ enabled, href, label, children }: {
  enabled: boolean; href: string; label: string; children: React.ReactNode;
}) {
  return enabled ? (
    <Button asChild variant="outline" size="icon-lg">
      <Link href={href} prefetch={false} aria-label={label} title={label}>{children}</Link>
    </Button>
  ) : <Button variant="outline" size="icon-lg" disabled aria-label={label} title={label}>{children}</Button>;
}
