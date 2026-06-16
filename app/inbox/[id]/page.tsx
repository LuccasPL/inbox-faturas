import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getOrCreateTenantForUser } from '@/lib/auth/tenant';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';
import { ArrowLeft, Paperclip } from 'lucide-react';
import { DraftEditor } from './draft-editor';
import { ReprocessarButton } from './reprocessar-button';
import { EliminarButton } from './eliminar-button';

interface PostmarkAttachment {
  Name?: string;
  ContentType?: string;
  ContentLength?: number;
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const dynamic = 'force-dynamic';

export default async function DetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await getOrCreateTenantForUser();

  const [resultado] = await db
    .select({
      email: emails,
      draft: faturasDraft,
    })
    .from(emails)
    .leftJoin(faturasDraft, eq(faturasDraft.emailId, emails.id))
    .where(and(eq(emails.id, id), eq(emails.tenantId, tenant.id)))
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
          <ReprocessarButton emailId={email.id} />
          <EliminarButton emailId={email.id} />
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

            {(() => {
              const attachments =
                (email.attachments as PostmarkAttachment[] | null) ?? [];
              if (attachments.length === 0) return null;
              return (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      Anexos ({attachments.length})
                    </div>
                    <div className="space-y-1">
                      {attachments.map((att, i) => (
                        <a
                          key={i}
                          href={`/api/emails/${email.id}/attachments/${i}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 rounded-md hover:bg-accent text-sm border"
                        >
                          <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {att.Name ?? `attachment-${i}`}
                          </span>
                          <span className="text-xs text-muted-foreground ml-auto shrink-0">
                            {formatBytes(att.ContentLength)}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
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