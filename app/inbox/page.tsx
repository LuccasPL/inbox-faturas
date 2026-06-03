import { db } from '@/lib/db';
import { emails } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const lista = await db
    .select()
    .from(emails)
    .orderBy(desc(emails.createdAt))
    .limit(50);

  return (
    <main className="min-h-screen">
      <header className="flex justify-between items-center p-6 border-b">
        <Link href="/" className="text-xl font-bold">Inbox Faturas</Link>
        <UserButton />
      </header>
      
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-6">Inbox</h1>
        <div className="space-y-3">
          {lista.length === 0 && (
            <p className="text-gray-500">
              Nenhum email ainda. Manda um para o teu endereço de inbound para testar.
            </p>
          )}
          {lista.map(email => (
            <div key={email.id} className="border rounded-lg p-4 hover:bg-gray-50">
              <div className="flex justify-between text-sm text-gray-600">
                <span>{email.fromEmail}</span>
                <span>{email.createdAt?.toLocaleString('pt-PT')}</span>
              </div>
              <div className="font-semibold mt-1">
                {email.subject || '(sem assunto)'}
              </div>
              <div className="text-sm text-gray-700 mt-2 line-clamp-2">
                {email.bodyText?.slice(0, 200)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}