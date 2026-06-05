import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';

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

  return (
    <main className="min-h-screen">
      <header className="flex justify-between items-center p-6 border-b">
        <Link href="/" className="text-xl font-bold">Inbox Faturas</Link>
        <UserButton />
      </header>
      
      <div className="max-w-5xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-6">Inbox</h1>
        <div className="space-y-3">
          {lista.length === 0 && (
            <p className="text-gray-500">
              Nenhum email ainda. Manda um para o teu endereço de inbound para testar.
            </p>
          )}
          {lista.map(({ email, draft }) => (
            <Link 
              key={email.id} 
              href={`/inbox/${email.id}`}
              className="block border rounded-lg p-4 hover:bg-gray-50 transition"
            >
              <div className="flex justify-between text-sm text-gray-600">
                <span>{email.fromEmail}</span>
                <span>{email.createdAt?.toLocaleString('pt-PT')}</span>
              </div>
              <div className="font-semibold mt-1">
                {email.subject || '(sem assunto)'}
              </div>
              
              {draft && (
                <div className="mt-3 p-3 bg-blue-50 rounded text-sm">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-blue-900">
                      Draft de Fatura
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      draft.confiancaExtracao === 'alta' ? 'bg-green-100 text-green-800' :
                      draft.confiancaExtracao === 'media' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      Confiança: {draft.confiancaExtracao}
                    </span>
                  </div>
                  <div className="text-gray-700">
                    {draft.clienteNome || '(cliente não identificado)'} 
                    {draft.clienteNif && ` · NIF ${draft.clienteNif}`}
                    {draft.total && ` · ${Number(draft.total).toFixed(2)}€`}
                  </div>
                </div>
              )}
              
              {!draft && email.status === 'extraction_failed' && (
                <div className="mt-3 p-2 bg-red-50 rounded text-sm text-red-700">
                  Falha na extração — clica para ver detalhes
                </div>
              )}
              
              {!draft && email.status === 'processing' && (
                <div className="mt-3 p-2 bg-gray-50 rounded text-sm text-gray-600">
                  A processar...
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}