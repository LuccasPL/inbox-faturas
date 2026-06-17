import Link from 'next/link';
import { ArrowLeft, FileText, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col bg-muted/35">
      <header className="border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="size-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">Inbox Faturas</div>
              <div className="text-xs text-muted-foreground">
                Email para draft revisto
              </div>
            </div>
          </Link>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-muted">
            <span className="text-xl font-semibold tabular-nums tracking-tight text-muted-foreground">
              404
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Página não encontrada
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            O link pode ter expirado, ou o pedido já foi eliminado.
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/inbox">
                <Inbox className="size-4" />
                Ir para a inbox
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">
                <ArrowLeft className="size-4" />
                Voltar à landing
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
