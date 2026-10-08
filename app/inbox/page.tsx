import Link from 'next/link';
import { Inbox, CheckCircle2, CircleDashed, Download, SearchX } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/app-shell';
import { getOrCreateTenantForUser } from '@/lib/auth/tenant';
import { hasInboxFilters, inboxDetailHref, inboxHref, parseInboxFilters, type InboxSearchParams } from '@/lib/inbox/filters';
import { ReclassificarButton } from './reclassificar-button';
import { SetupChecklist } from './setup-checklist';
import { ConcluidaRow, IgnoradoRow, PorReverRow } from './email-row';
import { InboxFilterBar, InboxNavigation, InboxPagination } from './inbox-controls';
import { loadInbox } from './queries';
import { INBOX_PRIORITIES } from '@/lib/inbox/priorities';
import { settingsReadiness } from '@/lib/settings/environment';

export const dynamic = 'force-dynamic';

export default async function InboxPage({ searchParams }: { searchParams: Promise<InboxSearchParams> }) {
  const tenant = await getOrCreateTenantForUser();
  const filters = parseInboxFilters(await searchParams);
  const inbox = await loadInbox(tenant.id, filters);
  const currentFilters = { ...filters, page: inbox.page };
  const usesPdfProforma = tenant.emissaoVia === 'pdf_proforma';
  const filtered = hasInboxFilters(filters);
  const priority = INBOX_PRIORITIES.find(item => item.id === filters.priority);
  const subtitle = inbox.counts['por-rever'] > 0
    ? `${inbox.counts['por-rever'].toLocaleString('pt-PT')} ${inbox.counts['por-rever'] === 1 ? 'pedido' : 'pedidos'} por tratar.`
    : 'Tudo em dia, sem pedidos pendentes.';
  const content = {
    'por-rever': {
      title: 'Pedidos por rever',
      description: 'Triagem incerta, drafts pendentes e extrações falhadas.',
      emptyTitle: 'Sem pedidos por rever',
      emptyDescription: 'Os novos pedidos de fatura aparecem aqui assim que chegam.',
      icon: Inbox,
    },
    concluidas: {
      title: usesPdfProforma ? 'Documentos concluídos' : 'Faturas concluídas',
      description: usesPdfProforma
        ? 'Aprovados, proformas emitidas ou rejeitados, com numeração e estado de envio.'
        : 'Aprovadas, emitidas ou rejeitadas, com o número do documento Moloni.',
      emptyTitle: usesPdfProforma ? 'Ainda nenhum documento concluído' : 'Ainda nenhuma fatura concluída',
      emptyDescription: 'Os pedidos aprovados, emitidos ou rejeitados aparecem aqui.',
      icon: CheckCircle2,
    },
    ignorados: {
      title: 'Ignorados pela triagem',
      description: 'Emails classificados como não-fatura, disponíveis para reclassificação.',
      emptyTitle: 'Nenhum email ignorado',
      emptyDescription: 'A triagem ainda não classificou nenhum email como não-fatura.',
      icon: CircleDashed,
    },
  }[filters.tab];
  const EmptyIcon = filtered ? SearchX : content.icon;

  return (
    <AppShell active="inbox" title="Inbox" description={subtitle}>
      <div className="space-y-5">
        <SetupChecklist items={settingsReadiness(tenant)} />
        <InboxNavigation filters={currentFilters} counts={inbox.counts} />
        <InboxFilterBar filters={currentFilters} />
        <Card className="workspace-panel">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div className="min-w-0 flex-1">
              <CardTitle>{priority?.title ?? content.title}</CardTitle>
              <CardDescription>{priority?.description ?? content.description}</CardDescription>
            </div>
            {filters.tab === 'concluidas' && inbox.counts.concluidas > 0 && (
              <Button asChild variant="outline" size="sm">
                <a href="/api/export/concluidas" download title="Exportar todos os documentos concluídos, sem filtros">
                  <Download aria-hidden /> CSV completo
                </a>
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {inbox.rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted"><EmptyIcon aria-hidden className="size-6 text-muted-foreground" /></div>
                <div className="text-sm font-medium">{filtered ? 'Nenhum resultado encontrado' : content.emptyTitle}</div>
                <p className="max-w-sm text-sm text-muted-foreground">{filtered ? 'Não há registos neste grupo que correspondam aos filtros selecionados.' : content.emptyDescription}</p>
                {filtered && <Button asChild variant="outline" size="sm"><Link href={inboxHref(parseInboxFilters({ tab: filters.tab }))} prefetch={false}>Limpar filtros</Link></Button>}
              </div>
            ) : (
              <div className="divide-y border-t">
                {inbox.rows.map(({ email, draft }) => {
                  const href = inboxDetailHref(email.id, currentFilters);
                  if (filters.tab === 'concluidas' && draft) return <ConcluidaRow key={email.id} email={email} draft={draft} href={href}
                    shareDeadlineLabel={filters.priority === 'link-a-expirar' ? 'Expira em' : filters.priority === 'link-expirado' ? 'Expirou em' : undefined} />;
                  if (filters.tab === 'ignorados') return <IgnoradoRow key={email.id} email={email} href={href} action={<ReclassificarButton emailId={email.id} action="parafatura" />} />;
                  return <PorReverRow key={email.id} email={email} draft={draft} href={href} />;
                })}
              </div>
            )}
            <InboxPagination filters={currentFilters} total={inbox.total} page={inbox.page} totalPages={inbox.totalPages} shown={inbox.rows.length} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
