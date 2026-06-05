import Link from 'next/link';
import { Show, UserButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center p-6 border-b">
        <h1 className="text-xl font-bold">Inbox Faturas</h1>
        <div className="flex gap-2 items-center">
          <ThemeToggle />
          <Show when="signed-out">
            <Button variant="ghost" asChild>
              <Link href="/sign-in">Entrar</Link>
            </Button>
            <Button asChild>
              <Link href="/sign-up">Criar conta</Link>
            </Button>
          </Show>
          <Show when="signed-in">
            <Button asChild>
              <Link href="/inbox">Abrir Inbox</Link>
            </Button>
            <UserButton />
          </Show>
        </div>
      </header>

      <section className="flex-1 flex flex-col justify-center items-center text-center p-8 max-w-2xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
          Faturas geradas a partir de emails, em segundos.
        </h2>
        <p className="text-xl text-muted-foreground mb-8">
          Os teus clientes pedem faturas por email. A IA extrai os dados,
          gera o draft no teu software de faturação, e tu aprovas com um clique.
        </p>
        <Show when="signed-out">
          <Button size="lg" asChild>
            <Link href="/sign-up">Começar gratuitamente</Link>
          </Button>
        </Show>
      </section>
    </main>
  );
}