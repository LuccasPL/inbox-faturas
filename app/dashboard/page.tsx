import Link from 'next/link';
import { ArrowRight, CheckCircle2, Inbox, Receipt, TrendingUp } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getOrCreateTenantForUser } from '@/lib/auth/tenant';
import { loadDashboard } from './queries';
import { Sparkline } from './sparkline';

export const dynamic = 'force-dynamic';

const eur = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const pct = new Intl.NumberFormat('pt-PT', {
  style: 'percent',
  maximumFractionDigits: 0,
});

export default async function DashboardPage() {
  const tenant = await getOrCreateTenantForUser();
  const data = await loadDashboard(tenant.id);

  const totalConfianca =
    data.distribuicaoConfianca.alta +
    data.distribuicaoConfianca.media +
    data.distribuicaoConfianca.baixa;

  return (
    <AppShell
      active="dashboard"
      title="Dashboard"
      description="Visão geral do mês e atividade dos últimos 30 dias."
    >
      <div className="space-y-6">
        {/* ----------------------------- KPIs ----------------------------- */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label="Por rever"
            value={data.porRever.toLocaleString('pt-PT')}
            icon={<Inbox className="size-4" />}
            tone="amber"
            href="/inbox"
            hint="pedidos à espera"
          />
          <Kpi
            label="Emitidas (mês)"
            value={data.emitidasMes.toLocaleString('pt-PT')}
            icon={<Receipt className="size-4" />}
            tone="emerald"
            hint="documentos no Moloni"
          />
          <Kpi
            label="Receita (mês)"
            value={eur.format(data.receitaMes)}
            icon={<TrendingUp className="size-4" />}
            tone="sky"
            hint="total faturado emitido"
          />
          <Kpi
            label="Taxa aprovação"
            value={
              data.taxaAprovacao === null ? '—' : pct.format(data.taxaAprovacao)
            }
            icon={<CheckCircle2 className="size-4" />}
            tone="emerald"
            hint="aprovados sobre revistos"
          />
        </div>

        {/* --------------------- Pedidos por dia (30d) -------------------- */}
        <Card className="rounded-lg">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Pedidos por dia</CardTitle>
              <CardDescription>Últimos 30 dias</CardDescription>
            </div>
            <Badge variant="secondary">
              {data.pedidosPorDia.reduce((s, d) => s + d.count, 0)} pedidos
            </Badge>
          </CardHeader>
          <CardContent>
            <Sparkline data={data.pedidosPorDia} height={120} />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{formatLabel(data.pedidosPorDia[0]?.date)}</span>
              <span>
                {formatLabel(
                  data.pedidosPorDia[data.pedidosPorDia.length - 1]?.date,
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* --------------- Top clientes + Distribuição IA ----------------- */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Top clientes</CardTitle>
              <CardDescription>
                Por valor faturado em pedidos confirmados.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {data.topClientes.length === 0 ? (
                <EmptyHint
                  title="Sem clientes confirmados ainda"
                  description="Aparecem aqui assim que emitires a primeira fatura."
                />
              ) : (
                <div className="divide-y border-t">
                  {data.topClientes.map((c) => {
                    const maxTotal = data.topClientes[0]?.total ?? 0;
                    const pct =
                      maxTotal > 0
                        ? Math.max((c.total / maxTotal) * 100, 6)
                        : 0;
                    return (
                      <div
                        key={c.nome}
                        className="flex items-center gap-4 px-5 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="truncate text-sm font-medium">
                              {c.nome}
                            </div>
                            <div className="shrink-0 text-sm font-medium tabular-nums">
                              {eur.format(c.total)}
                            </div>
                          </div>
                          <div className="mt-1.5 flex items-center gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary/70"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="text-xs tabular-nums text-muted-foreground">
                              {c.count} doc{c.count === 1 ? '' : 's'}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Confiança da extração</CardTitle>
              <CardDescription>
                Distribuição entre todos os drafts criados pela IA.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {totalConfianca === 0 ? (
                <EmptyHint
                  title="Ainda sem drafts da IA"
                  description="Os níveis aparecem quando começarem a chegar pedidos."
                />
              ) : (
                <>
                  <ConfBar
                    label="Alta"
                    value={data.distribuicaoConfianca.alta}
                    total={totalConfianca}
                    tone="emerald"
                  />
                  <ConfBar
                    label="Média"
                    value={data.distribuicaoConfianca.media}
                    total={totalConfianca}
                    tone="amber"
                  />
                  <ConfBar
                    label="Baixa"
                    value={data.distribuicaoConfianca.baixa}
                    total={totalConfianca}
                    tone="rose"
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */

type Tone = 'amber' | 'emerald' | 'sky' | 'rose';

const TONE_BG: Record<Tone, string> = {
  amber:
    'bg-amber-500/12 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  emerald:
    'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  sky: 'bg-sky-500/12 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
  rose: 'bg-rose-500/12 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
};

const TONE_BAR: Record<Tone, string> = {
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  rose: 'bg-rose-500',
};

function Kpi({
  label,
  value,
  icon,
  tone,
  href,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: Tone;
  href?: string;
  hint?: string;
}) {
  const inner = (
    <div className="flex h-full flex-col rounded-lg border bg-background p-5 transition-colors hover:bg-muted/30">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span
          className={`flex size-8 items-center justify-center rounded-lg ${TONE_BG[tone]}`}
        >
          {icon}
        </span>
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{hint}</span>
        {href && <ArrowRight className="size-3.5" />}
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function ConfBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: Tone;
}) {
  const ratio = total === 0 ? 0 : value / total;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value} ({Math.round(ratio * 100)}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${TONE_BAR[tone]}`}
          style={{ width: `${Math.max(ratio * 100, 2)}%` }}
        />
      </div>
    </div>
  );
}

function EmptyHint({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="text-sm font-medium">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function formatLabel(date: string | undefined): string {
  if (!date) return '';
  const d = new Date(date + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
}
