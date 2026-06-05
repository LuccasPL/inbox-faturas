import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';
import { ArrowLeft } from 'lucide-react';

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

  const confiancaVariant = (confianca: string | null) => {
    if (confianca === 'alta') return 'default';
    if (confianca === 'media') return 'secondary';
    return 'destructive';
  };

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
        {/* Coluna esquerda: email original */}
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

        {/* Coluna direita: draft de fatura */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Draft de Fatura</CardTitle>
            {draft && (
              <Badge variant={confiancaVariant(draft.confiancaExtracao)}>
                Confiança: {draft.confiancaExtracao}
              </Badge>
            )}
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
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Cliente
                  </label>
                  <div className="font-medium">{draft.clienteNome || '—'}</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      NIF
                    </label>
                    <div className="font-medium">{draft.clienteNif || '—'}</div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Email
                    </label>
                    <div className="font-medium text-sm">
                      {draft.clienteEmail || '—'}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Morada
                  </label>
                  <div className="text-sm">{draft.clienteMorada || '—'}</div>
                </div>

                <Separator />

                <div>
                  <label className="text-xs text-muted-foreground block mb-2">
                    Items
                  </label>
                  {items.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Sem items</div>
                  ) : (
                    <div className="space-y-2">
                      {items.map((item, i) => (
                        <div key={i} className="p-3 bg-muted rounded-md text-sm">
                          <div className="font-medium">{item.descricao}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {item.quantidade} × {item.preco_unitario}€ (IVA{' '}
                            {item.iva_percentagem}%)
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Subtotal
                    </label>
                    <div className="font-medium">
                      {draft.subtotal
                        ? `${Number(draft.subtotal).toFixed(2)}€`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      IVA
                    </label>
                    <div className="font-medium">
                      {draft.ivaValor
                        ? `${Number(draft.ivaValor).toFixed(2)}€`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Total
                    </label>
                    <div className="font-bold text-lg">
                      {draft.total ? `${Number(draft.total).toFixed(2)}€` : '—'}
                    </div>
                  </div>
                </div>

                {draft.iban && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      IBAN
                    </label>
                    <div className="font-mono text-sm">{draft.iban}</div>
                  </div>
                )}

                {draft.prazoPagamento && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Prazo
                    </label>
                    <div className="text-sm">{draft.prazoPagamento}</div>
                  </div>
                )}

                {(draft.rawIaResponse as any) && (
                  <div className="mt-4 p-3 bg-primary/5 border border-primary/10 rounded-md">
                    <div className="text-xs font-medium mb-1">Notas da IA</div>
                    <div className="text-sm text-muted-foreground">
                      {(draft.rawIaResponse as any)?.content?.find(
                        (b: any) => b.type === 'tool_use'
                      )?.input?.notas_extracao || 'Sem notas.'}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button>Aprovar (em breve)</Button>
                  <Button variant="outline">Editar (em breve)</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}