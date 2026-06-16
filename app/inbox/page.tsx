import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { desc, eq, and, or, inArray, isNull } from 'drizzle-orm';
import { Inbox, CheckCircle2, CircleDashed } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppShell } from '@/components/app-shell';
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

  const subtitle =
    porRever.length > 0
      ? `${porRever.length} ${porRever.length === 1 ? 'pedido' : 'pedidos'} à espera de revisão.`
      : 'Tudo em dia — sem pedidos pendentes.';

  return (
    <AppShell active="inbox" title="Inbox" description={subtitle}>
      <div className="space-y-6">
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

        <Tabs defaultValue="por-rever" className="space-y-4">
          <TabsList>
            <TabsTrigger value="por-rever" className="gap-2">
              Por rever
              <CountChip>{porRever.length}</CountChip>
            </TabsTrigger>
            <TabsTrigger value="concluidas" className="gap-2">
              Concluídas
              <CountChip>{concluidas.length}</CountChip>
            </TabsTrigger>
            <TabsTrigger value="ignorados" className="gap-2">
              Ignorados
              <CountChip>{ignorados.length}</CountChip>
            </TabsTrigger>
          </TabsList>

          {/* --------------------------- Por rever --------------------------- */}
          <TabsContent value="por-rever" className="mt-0">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Pedidos por rever</CardTitle>
                <CardDescription>
                  Triagem incerta, drafts pendentes e extrações falhadas — abre
                  cada um para rever ou reprocessar.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {porRever.length === 0 ? (
                  <EmptyState
                    icon={<Inbox className="size-6 text-muted-foreground" />}
                    title="Sem pedidos por rever"
                    description="Vais ver aqui novos pedidos de fatura assim que chegarem."
                  />
                ) : (
                  <div className="divide-y border-t">
                    {porRever.map(({ email, draft }) => (
                      <PorReverRow
                        key={email.id}
                        email={email}
                        draft={draft}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* --------------------------- Concluídas -------------------------- */}
          <TabsContent value="concluidas" className="mt-0">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Faturas concluídas</CardTitle>
                <CardDescription>
                  Aprovadas, emitidas ou rejeitadas. Os documentos emitidos no
                  Moloni aparecem com o número do documento.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {concluidas.length === 0 ? (
                  <EmptyState
                    icon={
                      <CheckCircle2 className="size-6 text-muted-foreground" />
                    }
                    title="Ainda nenhuma fatura concluída"
                    description="Os pedidos que aprovares ou emitires aparecem aqui."
                  />
                ) : (
                  <div className="divide-y border-t">
                    {concluidas.map(({ email, draft }) => (
                      <ConcluidaRow
                        key={email.id}
                        email={email}
                        draft={draft}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* --------------------------- Ignorados --------------------------- */}
          <TabsContent value="ignorados" className="mt-0">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Ignorados pela triagem</CardTitle>
                <CardDescription>
                  Emails que a IA classificou como não-fatura. Se algum estiver
                  errado, podes reclassificar como pedido.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {ignorados.length === 0 ? (
                  <EmptyState
                    icon={
                      <CircleDashed className="size-6 text-muted-foreground" />
                    }
                    title="Nenhum email ignorado"
                    description="A triagem ainda não rejeitou nenhum email como não-fatura."
                  />
                ) : (
                  <div className="divide-y border-t">
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
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Local UI                                                                  */
/* -------------------------------------------------------------------------- */

function CountChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground data-[state=active]:bg-background/60 data-[state=active]:text-foreground">
      {children}
    </span>
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
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <div className="text-sm font-medium">{title}</div>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
