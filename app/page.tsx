import Link from 'next/link';
import { Show, UserButton } from '@clerk/nextjs';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center p-6 border-b">
        <h1 className="text-xl font-bold">Inbox Faturas</h1>
        <div className="flex gap-3 items-center">
          <Show when="signed-out">
            <Link href="/sign-in" className="px-4 py-2 text-sm hover:underline">
              Entrar
            </Link>
            <Link href="/sign-up" className="px-4 py-2 text-sm bg-black text-white rounded">
              Criar conta
            </Link>
          </Show>
          <Show when="signed-in">
            <Link href="/inbox" className="px-4 py-2 text-sm bg-black text-white rounded">
              Abrir Inbox
            </Link>
            <UserButton />
          </Show>
        </div>
      </header>

      <section className="flex-1 flex flex-col justify-center items-center text-center p-8 max-w-2xl mx-auto">
        <h2 className="text-5xl font-bold mb-6">
          Faturas geradas a partir de emails, em segundos.
        </h2>
        <p className="text-xl text-gray-600 mb-8">
          Os teus clientes pedem faturas por email. A IA extrai os dados, 
          gera o draft no teu software de faturação, e tu aprovas com um clique.
        </p>
        <Show when="signed-out">
          <Link 
            href="/sign-up" 
            className="px-6 py-3 bg-black text-white rounded-lg text-lg"
          >
            Começar gratuitamente
          </Link>
        </Show>
      </section>
    </main>
  );
}