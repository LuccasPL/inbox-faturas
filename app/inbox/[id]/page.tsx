import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

export const dynamic = 'force-dynamic';

export default async function DetalhePage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
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

  return (
    <main className="min-h-screen">
      <header className="flex justify-between items-center p-6 border-b">
        <Link href="/inbox" className="text-xl font-bold">← Inbox</Link>
        <UserButton />
      </header>
      
      <div className="max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Coluna esquerda: email original */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Email Original</h2>
          <div className="border rounded-lg p-4 space-y-2 bg-gray-50">
            <div className="text-sm">
              <span className="text-gray-600">De:</span>{' '}
              <span className="font-medium">{email.fromEmail}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-600">Assunto:</span>{' '}
              <span className="font-medium">{email.subject}</span>
            </div>
            <div className="text-sm text-gray-600">
              {email.createdAt?.toLocaleString('pt-PT')}
            </div>
            <hr className="my-3" />
            <div className="whitespace-pre-wrap text-sm">
              {email.bodyText}
            </div>
          </div>
        </div>

        {/* Coluna direita: draft de fatura */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Draft de Fatura</h2>
            {draft && (
              <span className={`text-xs px-2 py-1 rounded ${
                draft.confiancaExtracao === 'alta' ? 'bg-green-100 text-green-800' :
                draft.confiancaExtracao === 'media' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                Confiança: {draft.confiancaExtracao}
              </span>
            )}
          </div>

          {!draft && (
            <div className="border rounded-lg p-4 bg-red-50">
              <p className="text-red-700">
                Não foi possível extrair dados deste email.
              </p>
              <p className="text-sm text-red-600 mt-2">
                Status: {email.status}
              </p>
            </div>
          )}

          {draft && (
            <div className="border rounded-lg p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-600 block">Cliente</label>
                <div className="font-medium">{draft.clienteNome || '—'}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 block">NIF</label>
                  <div className="font-medium">{draft.clienteNif || '—'}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-600 block">Email</label>
                  <div className="font-medium">{draft.clienteEmail || '—'}</div>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-600 block">Morada</label>
                <div className="text-sm">{draft.clienteMorada || '—'}</div>
              </div>

              <hr />

              <div>
                <label className="text-xs text-gray-600 block mb-2">Items</label>
                {items.length === 0 ? (
                  <div className="text-sm text-gray-500">Sem items</div>
                ) : (
                  <div className="space-y-2">
                    {items.map((item, i) => (
                      <div key={i} className="border rounded p-2 text-sm bg-gray-50">
                        <div className="font-medium">{item.descricao}</div>
                        <div className="text-xs text-gray-600 mt-1">
                          {item.quantidade} × {item.preco_unitario}€ 
                          {' '}(IVA {item.iva_percentagem}%)
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <hr />

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <label className="text-xs text-gray-600 block">Subtotal</label>
                  <div className="font-medium">
                    {draft.subtotal ? `${Number(draft.subtotal).toFixed(2)}€` : '—'}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600 block">IVA</label>
                  <div className="font-medium">
                    {draft.ivaValor ? `${Number(draft.ivaValor).toFixed(2)}€` : '—'}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600 block">Total</label>
                  <div className="font-bold text-lg">
                    {draft.total ? `${Number(draft.total).toFixed(2)}€` : '—'}
                  </div>
                </div>
              </div>

              {draft.iban && (
                <div>
                  <label className="text-xs text-gray-600 block">IBAN</label>
                  <div className="font-mono text-sm">{draft.iban}</div>
                </div>
              )}

              {draft.prazoPagamento && (
                <div>
                  <label className="text-xs text-gray-600 block">Prazo</label>
                  <div className="text-sm">{draft.prazoPagamento}</div>
                </div>
              )}

              {(draft.rawIaResponse as any) && (
                <div className="mt-4 p-3 bg-blue-50 rounded text-sm">
                  <div className="text-xs font-medium text-blue-900 mb-1">
                    Notas da IA
                  </div>
                  <div className="text-blue-800">
                    {((draft.rawIaResponse as any)?.content?.find((b: any) => b.type === 'tool_use')?.input?.notas_extracao) || 'Sem notas.'}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <button className="px-4 py-2 bg-black text-white rounded text-sm">
                  Aprovar (em breve)
                </button>
                <button className="px-4 py-2 border rounded text-sm">
                  Editar (em breve)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}