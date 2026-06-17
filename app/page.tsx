import Link from 'next/link';
import { Show, UserButton } from '@clerk/nextjs';
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  HelpCircle,
  Inbox,
  Mail,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';

export default function Home() {
  return (
    <main className="min-h-screen bg-muted/35">
      {/* -------------------------------- Header ------------------------------- */}
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
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
            <Link
              href="#como-funciona"
              className="hidden text-sm text-muted-foreground hover:text-foreground md:inline"
            >
              Como funciona
            </Link>
            <Link
              href="#features"
              className="hidden text-sm text-muted-foreground hover:text-foreground md:inline"
            >
              Features
            </Link>
            <div className="hidden h-5 w-px bg-border md:block" />
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

      {/* --------------------------------- Hero -------------------------------- */}
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 md:grid-cols-[0.95fr_1.05fr] md:px-8 md:py-24">
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
              <Link href="#como-funciona">Saber mais</Link>
            </Button>
          </div>
        </div>

        {/* Mockup do Inbox */}
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
              {
                from: 'financeiro@cliente.pt',
                subject: 'Fatura — consultoria',
                confidence: 'alta' as const,
                total: '1.845,00 €',
                tone: 'emerald' as const,
              },
              {
                from: 'ana@empresa.pt',
                subject: 'Pedido de fatura — junho',
                confidence: 'media' as const,
                total: '620,00 €',
                tone: 'amber' as const,
              },
              {
                from: 'compras@hotel.pt',
                subject: 'Dados para emissão',
                confidence: 'incerta' as const,
                total: 'A rever',
                tone: 'sky' as const,
              },
            ].map((row) => (
              <div
                key={row.subject}
                className="flex items-start gap-3 px-4 py-3.5"
              >
                <div
                  className={
                    'flex size-9 shrink-0 items-center justify-center rounded-lg ' +
                    (row.tone === 'emerald'
                      ? 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                      : row.tone === 'amber'
                        ? 'bg-amber-500/12 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                        : 'bg-sky-500/12 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400')
                  }
                >
                  {row.tone === 'emerald' ? (
                    <FileText className="size-4" />
                  ) : row.tone === 'amber' ? (
                    <FileText className="size-4" />
                  ) : (
                    <HelpCircle className="size-4" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {row.subject}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {row.from} · confiança {row.confidence}
                  </div>
                </div>

                <div className="shrink-0 text-right text-sm font-medium tabular-nums">
                  {row.total}
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

      {/* ----------------------------- Como funciona --------------------------- */}
      <section
        id="como-funciona"
        className="border-y bg-background py-16 md:py-20"
      >
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <div className="mb-10 max-w-2xl">
            <div className="text-sm font-medium text-muted-foreground">
              Como funciona
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Quatro passos entre o pedido e a fatura emitida.
            </h2>
          </div>

          <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: '01',
                title: 'Email chega',
                description:
                  'O cliente envia o pedido para o teu endereço Postmark. Anexos como PDFs ou orçamentos são guardados.',
                icon: Mail,
              },
              {
                step: '02',
                title: 'Triagem IA',
                description:
                  'Claude separa pedidos reais de ruído (OTPs, newsletters, marketing) com nível de confiança.',
                icon: ShieldCheck,
              },
              {
                step: '03',
                title: 'Extração',
                description:
                  'Cliente, NIF, linhas, IVA e total ficam preenchidos no draft. PDFs em anexo também são lidos.',
                icon: Sparkles,
              },
              {
                step: '04',
                title: 'Aprovação',
                description:
                  'Revês inline o que precisares e emites no Moloni com um clique — em rascunho ou final.',
                icon: CheckCircle2,
              },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <li
                  key={s.step}
                  className="relative rounded-lg border bg-muted/20 p-5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">
                      {s.step}
                    </span>
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-medium">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {s.description}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ------------------------------- Features ------------------------------ */}
      <section id="features" className="py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <div className="mb-10 max-w-2xl">
            <div className="text-sm font-medium text-muted-foreground">
              Pormenores
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Pensado para faturação em Portugal.
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: 'NIF validado',
                description:
                  'Verificação do checksum mod 11 antes de emitir — evita rejeições do ERP por NIFs inválidos.',
                icon: ShieldCheck,
              },
              {
                title: 'Memória por cliente',
                description:
                  'Faturas anteriores do mesmo cliente entram como contexto: morada, IVA típico, IBAN — tudo herda.',
                icon: Workflow,
              },
              {
                title: 'Integração Moloni',
                description:
                  'Emissão direta como rascunho ou final, com taxas mapeadas e número de documento devolvido.',
                icon: Zap,
              },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-lg border bg-background p-6"
                >
                  <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-5 text-foreground" />
                  </div>
                  <h3 className="mt-4 text-base font-medium">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {f.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* --------------------------------- CTA --------------------------------- */}
      <section className="border-t bg-background py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center md:px-8">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Tira o trabalho repetitivo da emissão.
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Hoje pões o setup em menos de 10 minutos e começas a aprovar drafts
            em vez de copiar e colar de emails.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Show when="signed-out">
              <Button size="lg" asChild>
                <Link href="/sign-up">
                  Criar conta
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/sign-in">Já tenho conta</Link>
              </Button>
            </Show>
            <Show when="signed-in">
              <Button size="lg" asChild>
                <Link href="/inbox">
                  Abrir inbox
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </Show>
          </div>
        </div>
      </section>

      {/* -------------------------------- Footer ------------------------------- */}
      <footer className="border-t bg-muted/20">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground md:flex-row md:px-8">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-foreground text-background">
              <FileText className="size-3" />
            </div>
            Inbox Faturas
          </div>
          <div>
            Em beta · construído em Portugal
          </div>
        </div>
      </footer>
    </main>
  );
}
