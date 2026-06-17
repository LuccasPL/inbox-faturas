import Link from 'next/link';
import { Users } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getOrCreateTenantForUser } from '@/lib/auth/tenant';
import { formatRelativeTime, formatFullDate } from '@/lib/format/time';
import { listClientes } from './queries';

export const dynamic = 'force-dynamic';

const eur = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
});

export default async function ClientesPage() {
  const tenant = await getOrCreateTenantForUser();
  const clientes = await listClientes(tenant.id);

  const totalReceita = clientes.reduce((s, c) => s + c.total, 0);
  const totalDocs = clientes.reduce((s, c) => s + c.contagem, 0);

  return (
    <AppShell
      active="clientes"
      title="Clientes"
      description={
        clientes.length > 0
          ? `${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'} com pelo menos uma fatura confirmada.`
          : 'Ainda sem clientes confirmados.'
      }
    >
      <div className="space-y-6">
        {/* Summary line */}
        {clientes.length > 0 && (
          <div className="grid gap-4 md:grid-cols-3">
            <SummaryStat
              label="Clientes"
              value={clientes.length.toLocaleString('pt-PT')}
            />
            <SummaryStat
              label="Faturas"
              value={totalDocs.toLocaleString('pt-PT')}
            />
            <SummaryStat
              label="Faturação total"
              value={eur.format(totalReceita)}
            />
          </div>
        )}

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Por valor faturado</CardTitle>
            <CardDescription>
              Inclui faturas aprovadas, em rascunho no Moloni, emitidas e
              proformas. Clica para abrir o detalhe.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {clientes.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <Users className="size-6 text-muted-foreground" />
                </div>
                <div className="text-sm font-medium">Sem clientes ainda</div>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Vão aparecer aqui quando confirmares a primeira fatura.
                </p>
              </div>
            ) : (
              <div className="divide-y border-t">
                {clientes.map((c) => {
                  const maxTotal = clientes[0]?.total ?? 0;
                  const pct =
                    maxTotal > 0
                      ? Math.max((c.total / maxTotal) * 100, 4)
                      : 0;
                  return (
                    <Link
                      key={c.key}
                      href={`/clientes/${encodeURIComponent(c.key)}`}
                      className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-medium uppercase">
                        {initials(c.nome)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="truncate text-sm font-medium">
                            {c.nome}
                          </div>
                          <div className="shrink-0 text-sm font-medium tabular-nums">
                            {eur.format(c.total)}
                          </div>
                        </div>
                        <div className="mt-1 flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary/70"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="shrink-0 text-xs text-muted-foreground">
                            {c.contagem} doc{c.contagem === 1 ? '' : 's'}
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                          {c.nif && <span>NIF {c.nif}</span>}
                          {c.email && <span>· {c.email}</span>}
                          {c.ultimaEm && (
                            <span title={formatFullDate(c.ultimaEm)}>
                              · última {formatRelativeTime(c.ultimaEm)}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function initials(nome: string): string {
  const parts = nome.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] + parts[parts.length - 1][0]);
}
