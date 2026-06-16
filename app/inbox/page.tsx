import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { desc, eq, and, or, inArray, isNull } from 'drizzle-orm';
import { Inbox, CheckCircle2, CircleDashed } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppHeader } from '@/components/app-header';
import { ReclassificarButton } from './reclassificar-button';
import { getOrCreateTenantForUser } from '@/lib/auth/tenant';
import { SetupChecklist } from './setup-checklist';
import {
  ConcluidaRow,
  IgnoradoRow,
  PorReverRow,
} from './email-row';

export const dynamic = 'force-dynamic';

const CONCLUIDO_STATUSES = [
  'aprovado',
  'rascunho_moloni',
  'emitida',
  'rejeitado',
] as const;

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
      and(
        eq(emails.tenantId, tenant.id),
        eq(emails.isFaturaRequest, 'nao'),
      ),
    )
    .orderBy(desc(emails.createdAt))
    .limit(50);

  return (
    <main className="min-h-screen bg-background">
      <AppHeader current="inbox" />

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            {porRever.length > 0
              ? `${porRever.length} ${porRever.length === 1 ? 'pedido' : 'pedidos'} à espera de revisão.`
              : 'Tudo em dia — sem pedidos pendentes.'}
          </p>
        </div>

        <div className="mb-6">
          <SetupChecklist
            tenant={{
              emailInbound: tenant.emailInbound,
              moloniConfigured:
                !!tenant.moloniApiKeyEnc &&
                !!tenant.moloniCompanyId &&
                !!tenant.moloniDefaultDocSetId &&
                !!tenant.moloniFallbackProductId,
            }}
          />
        </div>

        <Tabs defaultValue="por-rever">
          <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent p-0">
            <UnderlineTrigger value="por-rever" count={porRever.length}>
              Por rever
            </UnderlineTrigger>
            <UnderlineTrigger value="concluidas" count={concluidas.length}>
              Concluídas
            </UnderlineTrigger>
            <UnderlineTrigger value="ignorados" count={ignorados.length}>
              Ignorados
            </UnderlineTrigger>
          </TabsList>

          {/* --------------------------- Por rever --------------------------- */}
          <TabsContent value="por-rever" className="mt-2">
            {porRever.length === 0 ? (
              <EmptyState
                icon={<Inbox className="size-6 text-muted-foreground" />}
                title="Sem pedidos por rever"
                description="Vais ver aqui novos pedidos de fatura assim que chegarem."
              />
            ) : (
              <ListShell>
                {porRever.map(({ email, draft }) => (
                  <PorReverRow key={email.id} email={email} draft={draft} />
                ))}
              </ListShell>
            )}
          </TabsContent>

          {/* --------------------------- Concluídas -------------------------- */}
          <TabsContent value="concluidas" className="mt-2">
            {concluidas.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="size-6 text-muted-foreground" />}
                title="Ainda nenhuma fatura concluída"
                description="Os pedidos que aprovares ou emitires aparecem aqui."
              />
            ) : (
              <ListShell>
                {concluidas.map(({ email, draft }) => (
                  <ConcluidaRow key={email.id} email={email} draft={draft} />
                ))}
              </ListShell>
            )}
          </TabsContent>

          {/* --------------------------- Ignorados --------------------------- */}
          <TabsContent value="ignorados" className="mt-2">
            {ignorados.length === 0 ? (
              <EmptyState
                icon={<CircleDashed className="size-6 text-muted-foreground" />}
                title="Nenhum email ignorado"
                description="A triagem ainda não rejeitou nenhum email como não-fatura."
              />
            ) : (
              <ListShell>
                {ignorados.map((email) => (
                  <IgnoradoRow
                    key={email.id}
                    email={email}
                    action={
                      <ReclassificarButton
                        emailId={email.id}
                        action="parafatura"
                      />
                    }
                  />
                ))}
              </ListShell>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Local UI pieces                                                           */
/* -------------------------------------------------------------------------- */

function UnderlineTrigger({
  value,
  count,
  children,
}: {
  value: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <TabsTrigger
      value={value}
      className="relative rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-2 text-sm font-normal text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:text-foreground data-[state=active]:shadow-none"
    >
      {children}
      <span className="ml-1.5 rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
        {count}
      </span>
    </TabsTrigger>
  );
}

function ListShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card divide-y">
      {children}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <div className="text-sm font-medium">{title}</div>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
