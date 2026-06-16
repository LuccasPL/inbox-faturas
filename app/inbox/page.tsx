import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { desc, eq, and, or, inArray, isNull } from 'drizzle-orm';
import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ThemeToggle } from '@/components/theme-toggle';
import { ReclassificarButton } from './reclassificar-button';
import { getOrCreateTenantForUser } from '@/lib/auth/tenant';

export const dynamic = 'force-dynamic';

const CONCLUIDO_STATUSES = [
  'aprovado',
  'rascunho_moloni',
  'emitida',
  'rejeitado',
] as const;

export default async function InboxPage() {
  const tenant = await getOrCreateTenantForUser();

  // Por rever: precisa de atenção humana.
  // - Email passou triagem (sim/incerto/null) E
  // - Não tem draft, OU draft está em pendente_revisao/falha_emissao
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

  // Concluídas: trabalho terminado (qualquer destino final)
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

  // Ignorados: triagem disse "não é pedido de fatura"
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

  const confiancaVariant = (confianca: string | null) => {
    if (confianca === 'alta') return 'default';
    if (confianca === 'media') return 'secondary';
    return 'destructive';
  };

  return (
    <main className="min-h-screen">
      <header className="flex justify-between items-center p-6 border-b">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xl font-bold">
            Inbox Faturas
          </Link>
          <nav className="text-sm text-muted-foreground flex gap-4">
            <span className="text-foreground font-medium">Inbox</span>
            <Link href="/settings" className="hover:text-foreground">
              Settings
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserButton />
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-6 tracking-tight">Inbox</h1>

        <Tabs defaultValue="por-rever">
          <TabsList>
            <TabsTrigger value="por-rever">
              Por rever ({porRever.length})
            </TabsTrigger>
            <TabsTrigger value="concluidas">
              Concluídas ({concluidas.length})
            </TabsTrigger>
            <TabsTrigger value="ignorados">
              Ignorados ({ignorados.length})
            </TabsTrigger>
          </TabsList>

          {/* ----------------------------- Por rever --------------------------- */}
          <TabsContent value="por-rever" className="mt-6">
            {porRever.length === 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-muted-foreground">
                    Tudo em dia — nenhum pedido por rever.
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              {porRever.map(({ email, draft }) => (
                <Link
                  key={email.id}
                  href={`/inbox/${email.id}`}
                  className="block"
                >
                  <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                    <CardContent className="pt-6">
                      <div className="flex justify-between text-sm text-muted-foreground mb-1">
                        <span>{email.fromEmail}</span>
                        <span>{email.createdAt?.toLocaleString('pt-PT')}</span>
                      </div>
                      <div className="font-semibold">
                        {email.subject || '(sem assunto)'}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {email.isFaturaRequest === 'incerto' && (
                          <Badge variant="outline">Triagem incerta</Badge>
                        )}
                        {draft?.status === 'pendente_revisao' && (
                          <Badge variant="outline">Pendente revisão</Badge>
                        )}
                        {draft?.status === 'falha_emissao' && (
                          <Badge variant="destructive">Falha emissão</Badge>
                        )}
                        {draft?.confiancaExtracao && (
                          <Badge
                            variant={confiancaVariant(draft.confiancaExtracao)}
                          >
                            {draft.confiancaExtracao}
                          </Badge>
                        )}
                      </div>

                      {draft && (
                        <div className="mt-3 text-sm text-muted-foreground">
                          {draft.clienteNome || '(cliente não identificado)'}
                          {draft.clienteNif && ` · NIF ${draft.clienteNif}`}
                          {draft.total &&
                            ` · ${Number(draft.total).toFixed(2)}€`}
                        </div>
                      )}

                      {!draft && email.status === 'processing' && (
                        <div className="mt-3 text-sm text-muted-foreground italic">
                          A processar...
                        </div>
                      )}
                      {!draft && email.status === 'extraction_failed' && (
                        <div className="mt-3 text-sm text-destructive italic">
                          Extração falhou — abre para reprocessar
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </TabsContent>

          {/* ----------------------------- Concluídas -------------------------- */}
          <TabsContent value="concluidas" className="mt-6">
            {concluidas.length === 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-muted-foreground">
                    Ainda nenhuma fatura concluída.
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              {concluidas.map(({ email, draft }) => (
                <Link
                  key={email.id}
                  href={`/inbox/${email.id}`}
                  className="block"
                >
                  <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                    <CardContent className="pt-6">
                      <div className="flex justify-between text-sm text-muted-foreground mb-1">
                        <span>{draft.clienteNome || email.fromEmail}</span>
                        <span>{email.createdAt?.toLocaleString('pt-PT')}</span>
                      </div>

                      <div className="font-semibold">
                        {draft.clienteNif && `NIF ${draft.clienteNif} · `}
                        {draft.total
                          ? `${Number(draft.total).toFixed(2)}€`
                          : email.subject || '(sem assunto)'}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {draft.status === 'emitida' && (
                          <Badge>Emitida</Badge>
                        )}
                        {draft.status === 'rascunho_moloni' && (
                          <Badge variant="secondary">Rascunho Moloni</Badge>
                        )}
                        {draft.status === 'aprovado' && (
                          <Badge variant="secondary">
                            Aprovado (sem emitir)
                          </Badge>
                        )}
                        {draft.status === 'rejeitado' && (
                          <Badge variant="destructive">Rejeitado</Badge>
                        )}
                        {draft.moloniDocumentId && (
                          <Badge variant="outline">
                            Moloni #{draft.moloniDocumentId}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </TabsContent>

          {/* ----------------------------- Ignorados --------------------------- */}
          <TabsContent value="ignorados" className="mt-6">
            {ignorados.length === 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-muted-foreground">
                    Nenhum email ignorado. O sistema está a aprender o que é relevante.
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              {ignorados.map((email) => (
                <Card key={email.id}>
                  <CardContent className="pt-6">
                    <div className="flex justify-between text-sm text-muted-foreground mb-1">
                      <span>{email.fromEmail}</span>
                      <span>{email.createdAt?.toLocaleString('pt-PT')}</span>
                    </div>
                    <div className="font-medium">
                      {email.subject || '(sem assunto)'}
                    </div>
                    {email.triagemMotivo && (
                      <div className="text-xs text-muted-foreground mt-2 italic">
                        {email.triagemMotivo}
                      </div>
                    )}
                    <div className="mt-3">
                      <ReclassificarButton
                        emailId={email.id}
                        action="parafatura"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
