import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const lista = await db
    .select({
      email: emails,
      draft: faturasDraft,
    })
    .from(emails)
    .leftJoin(faturasDraft, eq(faturasDraft.emailId, emails.id))
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
        <Link href="/" className="text-xl font-bold">
          Inbox Faturas
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserButton />
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-6 tracking-tight">Inbox</h1>

        {lista.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">
                Nenhum email ainda. Manda um para o teu endereço de inbound para testar.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {lista.map(({ email, draft }) => (
            <Link key={email.id} href={`/inbox/${email.id}`} className="block">
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex justify-between text-sm text-muted-foreground mb-1">
                    <span>{email.fromEmail}</span>
                    <span>{email.createdAt?.toLocaleString('pt-PT')}</span>
                  </div>
                  <div className="font-semibold">
                    {email.subject || '(sem assunto)'}
                  </div>

                  {draft && (
                    <div className="mt-3 p-3 bg-muted rounded-md">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-sm">Draft de Fatura</span>
                        <div className="flex gap-2">
                          {draft.status === 'aprovado' && <Badge>Aprovado</Badge>}
                          {draft.status === 'rejeitado' && <Badge variant="destructive">Rejeitado</Badge>}
                          {draft.status === 'pendente_revisao' && (
                            <Badge variant="outline">Pendente</Badge>
                          )}
                          <Badge variant={confiancaVariant(draft.confiancaExtracao)}>
                            {draft.confiancaExtracao}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {draft.clienteNome || '(cliente não identificado)'}
                        {draft.clienteNif && ` · NIF ${draft.clienteNif}`}
                        {draft.total && ` · ${Number(draft.total).toFixed(2)}€`}
                      </div>
                    </div>
                  )}

                  {!draft && email.status === 'extraction_failed' && (
                    <div className="mt-3 p-3 bg-destructive/10 rounded-md text-sm text-destructive">
                      Falha na extração — clica para ver detalhes
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
      </div>
    </main>
  );
}