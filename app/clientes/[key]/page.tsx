import type { ComponentType } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  CreditCard,
  FileText,
  Mail,
  MapPin,
  Receipt,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getOrCreateTenantForUser } from '@/lib/auth/tenant';
import { formatRelativeTime, formatFullDate } from '@/lib/format/time';
import { loadClienteByKey } from '../queries';

export const dynamic = 'force-dynamic';

const eur = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
});

export default async function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const tenant = await getOrCreateTenantForUser();
  const cliente = await loadClienteByKey(tenant.id, decodeURIComponent(key));

  if (!cliente) notFound();

  const ivaPrincipal = cliente.ivaTipico[0];

  return (
    <AppShell
      active="clientes"
      title={cliente.nome}
      description={cliente.nif ? `NIF ${cliente.nif}` : 'Sem NIF registado'}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href="/clientes">
            <ArrowLeft className="size-4" />
            Clientes
          </Link>
        </Button>
      }
    >
      <div className="space-y-6">
        {/* ----------------------- KPIs ---------------------- */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label="Total confirmado"
            value={eur.format(cliente.total)}
            hint="Documentos confirmados"
          />
          <Kpi
            label="Documentos"
            value={cliente.contagem.toLocaleString('pt-PT')}
            hint="Aprovados, emitidos, proformas"
          />
          <Kpi
            label="Última atividade"
            value={
              cliente.ultimaEm
                ? formatRelativeTime(cliente.ultimaEm)
                : '—'
            }
            hint={
              cliente.ultimaEm ? formatFullDate(cliente.ultimaEm) : 'Sem registo'
            }
          />
          <Kpi
            label="IVA típico"
            value={ivaPrincipal ? `${ivaPrincipal.rate}%` : '—'}
            hint={
              ivaPrincipal
                ? `${ivaPrincipal.count} linha${ivaPrincipal.count === 1 ? '' : 's'}`
                : 'Sem linhas confirmadas'
            }
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          {/* ----------------- Dados ----------------- */}
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Dados do cliente</CardTitle>
              <CardDescription>
                Últimos valores confirmados nos drafts deste cliente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DataRow icon={Receipt} label="NIF" value={cliente.nif} />
              <DataRow icon={Mail} label="Email" value={cliente.email} />
              <DataRow icon={MapPin} label="Morada" value={cliente.morada} />
              <DataRow
                icon={CreditCard}
                label="IBAN frequente"
                value={cliente.ibanFrequente}
              />
              <DataRow
                icon={CircleDashed}
                label="Primeiro contacto"
                value={
                  cliente.primeiroEm
                    ? formatFullDate(cliente.primeiroEm)
                    : null
                }
              />
            </CardContent>
          </Card>

          {/* ----------------- Distribuição IVA ----------------- */}
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Padrão de IVA aplicado</CardTitle>
              <CardDescription>
                Linhas dos drafts deste cliente, agrupadas por taxa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {cliente.ivaTipico.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sem linhas registadas.
                </p>
              ) : (
                cliente.ivaTipico.map(({ rate, count }) => {
                  const total = cliente.ivaTipico.reduce(
                    (s, x) => s + x.count,
                    0,
                  );
                  const pct = count / total;
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
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${Math.max(pct * 100, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* ----------------- Histórico ----------------- */}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Histórico</CardTitle>
            <CardDescription>
              Últimos {cliente.drafts.length} drafts deste cliente — clica para
              abrir o detalhe.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y border-t">
              {cliente.drafts.map((d) => (
                <Link
                  key={d.id}
                  href={d.emailId ? `/inbox/${d.emailId}` : '#'}
                  className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/40"
                >
                  <StatusIcon status={d.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-sm font-medium">
                        {labelForStatus(d.status)}
                      </div>
                      <time
                        className="shrink-0 text-xs text-muted-foreground"
                        title={formatFullDate(d.createdAt)}
                      >
                        {formatRelativeTime(d.createdAt)}
                      </time>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      {d.moloniDocumentId && (
                        <span>Moloni #{d.moloniDocumentId}</span>
                      )}
                      {d.proformaNumero && (
                        <span>
                          Proforma {String(d.proformaNumero).padStart(6, '0')}
                        </span>
                      )}
                    </div>
                  </div>
                  {d.total !== null && (
                    <div className="shrink-0 text-sm font-medium tabular-nums">
                      {eur.format(d.total)}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && (
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {hint}
        </div>
      )}
    </div>
  );
}

function DataRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
}) {
  return (
    <div className="grid grid-cols-[1.25rem_8rem_1fr] items-center gap-3">
      <Icon className="size-4 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className={value ? 'font-medium' : 'text-muted-foreground'}>
        {value ?? '—'}
      </span>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  let tone:
    | 'emerald'
    | 'sky'
    | 'amber'
    | 'rose'
    | 'slate' = 'slate';
  if (status === 'emitida' || status === 'aprovado') tone = 'emerald';
  else if (status === 'rascunho_moloni' || status === 'emitida_proforma')
    tone = 'sky';
  else if (status === 'rejeitado' || status === 'falha_emissao') tone = 'rose';
  else if (status === 'pendente_revisao') tone = 'amber';

  const toneClasses: Record<typeof tone, string> = {
    emerald:
      'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
    sky: 'bg-sky-500/12 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
    amber:
      'bg-amber-500/12 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    rose: 'bg-rose-500/12 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
    slate: 'bg-muted text-muted-foreground',
  };

  const Icon =
    status === 'rejeitado' || status === 'falha_emissao'
      ? CircleDashed
      : status === 'emitida' || status === 'aprovado'
        ? CheckCircle2
        : status === 'emitida_proforma' || status === 'rascunho_moloni'
          ? FileText
          : CircleDashed;

  return (
    <div
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${toneClasses[tone]}`}
    >
      <Icon className="size-4" />
    </div>
  );
}

function labelForStatus(status: string): string {
  switch (status) {
    case 'pendente_revisao':
      return 'Pendente revisão';
    case 'aprovado':
      return 'Aprovado';
    case 'rascunho_moloni':
      return 'Rascunho Moloni';
    case 'emitida':
      return 'Fatura emitida';
    case 'emitida_proforma':
      return 'Proforma emitida';
    case 'rejeitado':
      return 'Rejeitado';
    case 'falha_emissao':
      return 'Falha na emissão';
    default:
      return status;
  }
}
