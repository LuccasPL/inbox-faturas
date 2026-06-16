import Link from 'next/link';
import type { ComponentType } from 'react';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import {
  AlertTriangle,
  ArchiveX,
  CheckCircle2,
  Clock3,
  FileCheck2,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { getOrCreateTenantForUser } from '@/lib/auth/tenant';
import { ReclassificarButton } from './reclassificar-button';
import { SetupChecklist } from './setup-checklist';

export const dynamic = 'force-dynamic';

const CONCLUIDO_STATUSES = [
  'aprovado',
  'rascunho_moloni',
  'emitida',
  'rejeitado',
] as const;

type EmailRow = typeof emails.$inferSelect;
type DraftRow = typeof faturasDraft.$inferSelect;

export default async function InboxPage() {
  const tenant = await getOrCreateTenantForUser();

  const porRever = await db
    .select({ email: emails, draft: faturasDraft })
    .from(emails)
    .leftJoin(faturasDraft, eq(faturasDraft.emailId, emails.id))
    .where(
      and(
        eq(emails.tenantId, tenant.id),
        or(
          eq(emails.isFaturaRequest, 'sim'),
          eq(emails.isFaturaRequest, 'incerto'),
          isNull(emails.isFaturaRequest),
        ),
        or(
          isNull(faturasDraft.status),
          eq(faturasDraft.status, 'pendente_revisao'),
          eq(faturasDraft.status, 'falha_emissao'),
          eq(faturasDraft.status, 'emissao_em_curso'),
        ),
      ),
    )
    .orderBy(desc(emails.createdAt))
    .limit(50);

  const concluidas = await db
    .select({ email: emails, draft: faturasDraft })
    .from(emails)
    .innerJoin(faturasDraft, eq(faturasDraft.emailId, emails.id))
    .where(
      and(
        eq(emails.tenantId, tenant.id),
        inArray(faturasDraft.status, [...CONCLUIDO_STATUSES]),
      ),
    )
    .orderBy(desc(emails.createdAt))
    .limit(50);

  const ignorados = await db
    .select()
    .from(emails)
    .where(
      and(eq(emails.tenantId, tenant.id), eq(emails.isFaturaRequest, 'nao')),
    )
    .orderBy(desc(emails.createdAt))
    .limit(50);

  const moloniConfigured =
    !!tenant.moloniApiKeyEnc &&
    !!tenant.moloniCompanyId &&
    !!tenant.moloniDefaultDocSetId &&
    !!tenant.moloniFallbackProductId;

  const totalPorRever = porRever.reduce(
    (sum, row) => sum + moneyToNumber(row.draft?.total),
    0,
  );

  return (
    <AppShell
      active="inbox"
      title="Inbox"
      description="Pedidos recebidos, drafts gerados e emissao controlada num unico fluxo."
    >
      <div className="space-y-6">
        <SetupChecklist
          tenant={{
            emailInbound: tenant.emailInbound,
            moloniConfigured,
          }}
        />

        <section className="grid gap-3 md:grid-cols-4">
          <Metric
            icon={Clock3}
            label="Por rever"
            value={porRever.length.toString()}
            tone="amber"
          />
          <Metric
            icon={FileCheck2}
            label="Valor aberto"
            value={formatMoney(totalPorRever)}
            tone="blue"
          />
          <Metric
            icon={CheckCircle2}
            label="Concluidas"
            value={concluidas.length.toString()}
            tone="green"
          />
          <Metric
            icon={ArchiveX}
            label="Ignorados"
            value={ignorados.length.toString()}
            tone="neutral"
          />
        </section>

        <Tabs defaultValue="por-rever" className="gap-4">
          <div className="flex flex-col gap-3 border-b pb-3 md:flex-row md:items-center md:justify-between">
            <TabsList className="w-full md:w-fit">
              <TabsTrigger value="por-rever">
                Por rever
                <Badge variant="secondary">{porRever.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="concluidas">
                Concluidas
                <Badge variant="secondary">{concluidas.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="ignorados">
                Ignorados
                <Badge variant="secondary">{ignorados.length}</Badge>
              </TabsTrigger>
            </TabsList>
            <div className="text-sm text-muted-foreground">
              {tenant.emailInbound.endsWith('@pending.invalid')
                ? 'Email inbound ainda por configurar'
                : tenant.emailInbound}
            </div>
          </div>

          <TabsContent value="por-rever">
            <RequestList
              rows={porRever}
              empty={{
                icon: CheckCircle2,
                title: 'Tudo em dia',
                text: 'Nao ha pedidos pendentes para rever.',
              }}
            />
          </TabsContent>

          <TabsContent value="concluidas">
            <RequestList
              rows={concluidas}
              empty={{
                icon: FileCheck2,
                title: 'Sem faturas concluidas',
                text: 'Quando aprovares ou enviares documentos, aparecem aqui.',
              }}
            />
          </TabsContent>

          <TabsContent value="ignorados">
            <IgnoredList rows={ignorados} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function RequestList({
  rows,
  empty,
}: {
  rows: Array<{ email: EmailRow; draft: DraftRow | null }>;
  empty: {
    icon: ComponentType<{ className?: string }>;
    title: string;
    text: string;
  };
}) {
  if (rows.length === 0) {
    return <EmptyState {...empty} />;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="hidden grid-cols-[1.4fr_1fr_auto_auto] gap-4 border-b bg-muted/45 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
        <span>Pedido</span>
        <span>Cliente</span>
        <span className="text-right">Valor</span>
        <span className="text-right">Estado</span>
      </div>
      <div className="divide-y">
        {rows.map(({ email, draft }) => (
          <Link
            key={email.id}
            href={`/inbox/${email.id}`}
            className="grid gap-3 px-4 py-4 transition-colors hover:bg-muted/45 md:grid-cols-[1.4fr_1fr_auto_auto] md:items-center"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {email.subject || '(sem assunto)'}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {email.fromEmail}
              </div>
            </div>
            <div className="min-w-0 text-sm">
              <div className="truncate font-medium">
                {draft?.clienteNome || 'Cliente por identificar'}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {draft?.clienteNif ? `NIF ${draft.clienteNif}` : formatDate(email.createdAt)}
              </div>
            </div>
            <div className="text-sm font-semibold md:min-w-28 md:text-right">
              {draft?.total ? formatMoney(Number(draft.total)) : '-'}
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <StatusBadges email={email} draft={draft} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function IgnoredList({ rows }: { rows: EmailRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ArchiveX}
        title="Sem emails ignorados"
        text="Emails classificados como ruido ficam guardados aqui."
      />
    );
  }

  return (
    <div className="grid gap-3">
      {rows.map((email) => (
        <Card key={email.id} size="sm" className="rounded-lg">
          <CardContent className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {email.subject || '(sem assunto)'}
                </span>
                <Badge variant="outline">Ignorado</Badge>
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {email.fromEmail} · {formatDate(email.createdAt)}
              </div>
              {email.triagemMotivo && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {email.triagemMotivo}
                </div>
              )}
            </div>
            <ReclassificarButton emailId={email.id} action="parafatura" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatusBadges({
  email,
  draft,
}: {
  email: EmailRow;
  draft: DraftRow | null;
}) {
  return (
    <>
      {email.isFaturaRequest === 'incerto' && (
        <Badge variant="outline">Triagem incerta</Badge>
      )}
      {draft?.status === 'pendente_revisao' && (
        <Badge variant="outline">Pendente</Badge>
      )}
      {draft?.status === 'falha_emissao' && (
        <Badge variant="destructive">
          <AlertTriangle className="size-3" />
          Falha
        </Badge>
      )}
      {draft?.status === 'emissao_em_curso' && (
        <Badge variant="secondary">Emissao</Badge>
      )}
      {draft?.status === 'emitida' && <Badge>Emitida</Badge>}
      {draft?.status === 'rascunho_moloni' && (
        <Badge variant="secondary">Moloni</Badge>
      )}
      {draft?.status === 'aprovado' && (
        <Badge variant="secondary">Aprovado</Badge>
      )}
      {draft?.status === 'rejeitado' && (
        <Badge variant="destructive">Rejeitado</Badge>
      )}
      {draft?.confiancaExtracao && (
        <Badge
          variant={
            draft.confiancaExtracao === 'alta'
              ? 'default'
              : draft.confiancaExtracao === 'media'
                ? 'secondary'
                : 'destructive'
          }
        >
          {draft.confiancaExtracao}
        </Badge>
      )}
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: 'amber' | 'blue' | 'green' | 'neutral';
}) {
  const toneClass = {
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    blue: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
    green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    neutral: 'bg-muted text-muted-foreground',
  }[tone];

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`rounded-lg p-2 ${toneClass}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  text,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed bg-background p-8 text-center">
      <div className="mb-3 rounded-lg bg-muted p-3 text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div className="font-medium">{title}</div>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function moneyToNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

function formatDate(value: Date | null): string {
  if (!value) return '';
  return value.toLocaleString('pt-PT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
