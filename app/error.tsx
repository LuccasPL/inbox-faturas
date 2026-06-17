'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, FileText, Inbox, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[runtime error]', error);
  }, [error]);

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
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-7" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Algo correu mal
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Encontrámos um erro inesperado. Podes tentar novamente — se
            continuar a falhar, volta à inbox e abre o pedido pelo detalhe.
          </p>

          {error?.digest && (
            <div className="mt-4 inline-block rounded-md border bg-background px-3 py-1.5 text-xs text-muted-foreground">
              Referência:{' '}
              <code className="font-mono">{error.digest}</code>
            </div>
          )}

          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Button onClick={() => reset()}>
              <RotateCw className="size-4" />
              Tentar de novo
            </Button>
            <Button variant="outline" asChild>
              <Link href="/inbox">
                <Inbox className="size-4" />
                Ir para a inbox
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
