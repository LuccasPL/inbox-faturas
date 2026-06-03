import { db } from '@/lib/db';
import { tenants } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const lista = await db.select().from(tenants);
  
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-4">Inbox Faturas — Teste BD</h1>
      <h2 className="text-xl mb-2">Tenants:</h2>
      <pre className="bg-gray-100 p-4 rounded">
        {JSON.stringify(lista, null, 2)}
      </pre>
    </main>
  );
}