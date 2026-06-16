import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';
import { ArrowLeft } from 'lucide-react';
import { DraftEditor } from './draft-editor';

export const dynamic = 'force-dynamic';

export default async function DetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [resultado] = await db
    .select({
      email: emails,
      draft: faturasDraft,
    })
    .from(emails)
    .leftJoin(faturasDraft, eq(faturasDraft.emailId, emails.id))
    .where(eq(emails.id, id))
    .limit(1);

  if (!resultado) {
    notFound();
  }

  const { email, draft } = resultado;
  const items = (draft?.items as any[]) || [];

  const notasIA =
    (draft?.rawIaResponse as any)?.content?.find(
      (b: any) => b.type === 'tool_use'
    )?.input?.notas_extracao || '';

  return (
    <main className="min-h-screen">
      <header className="flex justify-between items-center p-6 border-b">
        <Button variant="ghost" asChild>
          <Link href="/inbox">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Inbox
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserButton />
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Email Original</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <span className="text-muted-foreground">De:</span>{' '}
              <span className="font-medium">{email.fromEmail}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Assunto:</span>{' '}
              <span className="font-medium">{email.subject}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {email.createdAt?.toLocaleString('pt-PT')}
            </div>
            <Separator />
            <div className="whitespace-pre-wrap text-sm">{email.bodyText}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Draft de Fatura</CardTitle>
          </CardHeader>
          <CardContent>
            {!draft && (
              <div className="p-4 bg-destructive/10 rounded-md">
                <p className="text-destructive font-medium">
                  Não foi possível extrair dados deste email.
                </p>
                <p className="text-sm text-destructive/80 mt-2">
                  Status: {email.status}
                </p>
              </div>
            )}

            {draft && (
              <DraftEditor
                draftId={draft.id}
                status={draft.status || 'pendente_revisao'}
                confianca={draft.confiancaExtracao}
                notasIA={notasIA}
                moloni={{
                  documentId: draft.moloniDocumentId,
                  emittedAt: draft.emittedAt
                    ? draft.emittedAt.toISOString()
                    : null,
                  error: draft.emitError,
                }}
                initial={{
                  clienteNome: draft.clienteNome,
                  clienteNif: draft.clienteNif,
                  clienteEmail: draft.clienteEmail,
                  clienteMorada: draft.clienteMorada,
                  items: items,
                  subtotal: draft.subtotal,
                  ivaValor: draft.ivaValor,
                  total: draft.total,
                  iban: draft.iban,
                  prazoPagamento: draft.prazoPagamento,
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}