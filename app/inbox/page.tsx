import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { desc, eq, and, or, isNull } from 'drizzle-orm';
import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ThemeToggle } from '@/components/theme-toggle';
import { ReclassificarButton } from './reclassificar-button';
import { getOrCreateTenantForUser } from '@/lib/auth/tenant';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const tenant = await getOrCreateTenantForUser();

  // Pedidos: emails classificados como sim ou incerto (ou ainda sem classificação)
  const pedidos = await db
    .select({
      email: emails,
      draft: faturasDraft,
    })
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
      ),
    )
    .orderBy(desc(emails.createdAt))
    .limit(50);

  // Ignorados: classificados como nao
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

        <Tabs defaultValue="pedidos">
          <TabsList>
            <TabsTrigger value="pedidos">
              Pedidos ({pedidos.length})
            </TabsTrigger>
            <TabsTrigger value="ignorados">
              Ignorados ({ignorados.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pedidos" className="mt-6">
            {pedidos.length === 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-muted-foreground">
                    Nenhum pedido de fatura ainda.
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              {pedidos.map(({ email, draft }) => (
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

                      {email.isFaturaRequest === 'incerto' && (
                        <Badge variant="outline" className="mt-2">
                          Triagem incerta
                        </Badge>
                      )}

                      {draft && (
                        <div className="mt-3 p-3 bg-muted rounded-md">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium text-sm">
                              Draft de Fatura
                            </span>
                            <div className="flex gap-2">
                              {draft.status === 'aprovado' && (
                                <Badge>Aprovado</Badge>
                              )}
                              {draft.status === 'rejeitado' && (
                                <Badge variant="destructive">Rejeitado</Badge>
                              )}
                              {draft.status === 'pendente_revisao' && (
                                <Badge variant="outline">Pendente</Badge>
                              )}
                              <Badge
                                variant={confiancaVariant(
                                  draft.confiancaExtracao
                                )}
                              >
                                {draft.confiancaExtracao}
                              </Badge>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {draft.clienteNome || '(cliente não identificado)'}
                            {draft.clienteNif && ` · NIF ${draft.clienteNif}`}
                            {draft.total &&
                              ` · ${Number(draft.total).toFixed(2)}€`}
                          </div>
                        </div>
                      )}

                      {!draft && email.status === 'processing' && (
                        <div className="mt-3 p-3 bg-muted rounded-md text-sm text-muted-foreground">
                          A processar...
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </TabsContent>

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