import Link from 'next/link';
import { Show, UserButton } from '@clerk/nextjs';
import { ArrowRight, CheckCircle2, FileText, Inbox, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';

export default function Home() {
  return (
    <main className="min-h-screen bg-muted/35">
      <header className="border-b bg-background/90 backdrop-blur">
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

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Show when="signed-out">
              <Button variant="ghost" asChild>
                <Link href="/sign-in">Entrar</Link>
              </Button>
              <Button asChild>
                <Link href="/sign-up">
                  Criar conta
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </Show>
            <Show when="signed-in">
              <Button asChild>
                <Link href="/inbox">
                  Abrir Inbox
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <UserButton />
            </Show>
          </div>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-10 px-4 py-10 md:grid-cols-[0.95fr_1.05fr] md:px-8">
        <div className="max-w-2xl">
          <Badge variant="outline" className="mb-4 bg-background">
            <Sparkles className="size-3" />
            PT-PT + revisão humana
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
            Pedidos de fatura entram por email. Drafts saem prontos para rever.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            O Inbox Faturas filtra ruído, extrai dados de clientes e linhas de
            faturação, e centraliza a aprovação antes da emissão no ERP.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Show when="signed-out">
              <Button size="lg" asChild>
                <Link href="/sign-up">
                  Começar
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </Show>
            <Show when="signed-in">
              <Button size="lg" asChild>
                <Link href="/inbox">
                  Ir para a inbox
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </Show>
            <Button size="lg" variant="outline" asChild>
              <Link href="/sign-in">Ver conta</Link>
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-background shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Inbox className="size-4" />
              Por rever
            </div>
            <Badge variant="secondary">3 pedidos</Badge>
          </div>
          <div className="divide-y">
            {[
              ['financeiro@cliente.pt', 'Fatura para serviços de consultoria', 'Alta', '1.845,00 EUR'],
              ['ana@empresa.pt', 'Pedido de faturação - junho', 'Média', '620,00 EUR'],
              ['compras@hotel.pt', 'Dados para emissão da fatura', 'Incerta', 'A rever'],
            ].map(([from, subject, confidence, total]) => (
              <div key={subject} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{subject}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {from}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={confidence === 'Alta' ? 'default' : 'secondary'}
                  >
                    {confidence}
                  </Badge>
                  <span className="min-w-24 text-right text-sm font-medium">
                    {total}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 border-t bg-muted/35 p-4 text-sm md:grid-cols-3">
            {['Triagem', 'Extração', 'Aprovação'].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-600" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
