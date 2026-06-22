import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  FileText,
  Inbox,
  Receipt,
  Send,
  Sparkles,
  TrendingUp,
  XCircle,
} from 'lucide-react';
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
import { loadDashboard, type ActivityItem } from './queries';
import { Sparkline } from './sparkline';
import { formatRelativeTime, formatFullDate } from '@/lib/format/time';

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
  const usesPdfProforma = tenant.emissaoVia === 'pdf_proforma';
  const data = await loadDashboard(
    tenant.id,
    usesPdfProforma ? 'pdf_proforma' : 'moloni',
  );

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
            label={data.outputLabel}
            value={data.emitidasMes.toLocaleString('pt-PT')}
            icon={<Receipt className="size-4" />}
            tone="emerald"
            hint={data.outputHint}
          />
          <Kpi
            label={usesPdfProforma ? 'Total emitido (mês)' : 'Receita (mês)'}
            value={eur.format(data.receitaMes)}
            icon={<TrendingUp className="size-4" />}
            tone="sky"
            hint={
              usesPdfProforma
                ? 'valor das proformas emitidas'
                : 'total faturado emitido'
            }
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

        {/* ---------------------------- Funnel ---------------------------- */}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Fluxo de processamento</CardTitle>
            <CardDescription>
              {usesPdfProforma
                ? 'Da chegada do email ao documento emitido.'
                : 'Da chegada do email à fatura emitida no Moloni.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y border-t">
              {data.funnel.map((stage, i) => {
                const max = data.funnel[0]?.value ?? 0;
                const pct = max > 0 ? (stage.value / max) * 100 : 0;
                const prev = i > 0 ? data.funnel[i - 1].value : null;
                const dropoff =
                  prev && prev > 0 ? 1 - stage.value / prev : null;
                return (
                  <div
                    key={stage.key}
                    className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5"
                  >
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="text-sm font-medium">
                          <span className="mr-2 text-xs text-muted-foreground tabular-nums">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          {stage.label}
                        </div>
                        {dropoff !== null && dropoff > 0.001 && (
                          <div className="text-xs tabular-nums text-muted-foreground">
                            −{Math.round(dropoff * 100)}%
                          </div>
                        )}
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-base font-semibold tabular-nums">
                      {stage.value.toLocaleString('pt-PT')}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* -------------------- Activity + Distribuição IVA --------------- */}
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Últimas atividades</CardTitle>
              <CardDescription>
                Os 8 acontecimentos mais recentes nos drafts.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {data.atividade.length === 0 ? (
                <EmptyHint
                  title="Ainda sem atividade"
                  description="Vais ver aqui drafts criados, aprovados e emitidos."
                />
              ) : (
                <div className="divide-y border-t">
                  {data.atividade.map((a) => (
                    <ActivityRow key={a.id} item={a} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Taxas de IVA aplicadas</CardTitle>
              <CardDescription>
                Linhas dos últimos 50 drafts confirmados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.distribuicaoIva.length === 0 ? (
                <EmptyHint
                  title="Sem linhas confirmadas"
                  description="Aparece quando aprovares o primeiro draft."
                />
              ) : (
                <IvaBreakdown slices={data.distribuicaoIva} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* --------------- Top clientes + Distribuição IA ----------------- */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Top clientes</CardTitle>
              <CardDescription>
                Por valor total em documentos confirmados.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {data.topClientes.length === 0 ? (
                <EmptyHint
                  title="Sem clientes confirmados ainda"
                  description="Aparecem aqui assim que concluíres o primeiro documento."
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
                        key={c.key}
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

/* -------------------------------------------------------------------------- */
/*  Activity row                                                              */
/* -------------------------------------------------------------------------- */

function ActivityRow({ item }: { item: ActivityItem }) {
  const { tone, Icon } = activityVisuals(item.status);
  return (
    <Link
      href={`/inbox/${item.emailId ?? item.id}`}
      className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
    >
      <div
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${TONE_BG[tone]}`}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="truncate text-sm font-medium">{item.label}</div>
          <time
            className="shrink-0 text-xs text-muted-foreground"
            title={formatFullDate(item.at)}
          >
            {formatRelativeTime(item.at)}
          </time>
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.detail ?? 'Cliente por identificar'}
        </div>
      </div>
      {item.total !== null && (
        <div className="shrink-0 text-sm font-medium tabular-nums">
          {eur.format(item.total)}
        </div>
      )}
    </Link>
  );
}

function activityVisuals(status: string): { tone: Tone; Icon: typeof FileText } {
  switch (status) {
    case 'emitida':
      return { tone: 'emerald', Icon: Send };
    case 'emitida_proforma':
      return { tone: 'sky', Icon: FileText };
    case 'rascunho_moloni':
      return { tone: 'sky', Icon: FileText };
    case 'aprovado':
      return { tone: 'emerald', Icon: CheckCircle2 };
    case 'rejeitado':
      return { tone: 'rose', Icon: XCircle };
    case 'falha_emissao':
      return { tone: 'rose', Icon: XCircle };
    case 'pendente_revisao':
      return { tone: 'amber', Icon: Sparkles };
    default:
      return { tone: 'amber', Icon: CircleDashed };
  }
}

/* -------------------------------------------------------------------------- */
/*  Iva breakdown                                                             */
/* -------------------------------------------------------------------------- */

function IvaBreakdown({ slices }: { slices: { rate: number; count: number }[] }) {
  const total = slices.reduce((s, x) => s + x.count, 0);
  if (total === 0) return null;
  return (
    <div className="space-y-3">
      {slices.map(({ rate, count }) => {
        const pct = count / total;
        const tone: Tone =
          rate === 23 ? 'emerald' : rate === 13 ? 'sky' : rate === 6 ? 'amber' : 'rose';
        return (
          <div key={rate}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium tabular-nums">
                IVA {rate}%
              </span>
              <span className="text-muted-foreground tabular-nums">
                {count} ({Math.round(pct * 100)}%)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${TONE_BAR[tone]}`}
                style={{ width: `${Math.max(pct * 100, 2)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
