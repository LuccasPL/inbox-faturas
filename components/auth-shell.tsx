import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Sparkles,
} from 'lucide-react';

interface AuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
  bullets?: string[];
}

const DEFAULT_BULLETS = [
  'Triagem automática separa pedidos reais de ruído',
  'Extração lê email e PDFs em anexo',
  'NIF validado antes de emitir no Moloni',
  'Memória por cliente — IVA, IBAN e morada herdam',
];

export function AuthShell({
  title,
  description,
  children,
  bullets = DEFAULT_BULLETS,
}: AuthShellProps) {
  return (
    <main className="min-h-screen bg-muted/35">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* ---------------------------- Brand panel ---------------------------- */}
        <aside className="relative hidden flex-col justify-between border-r bg-background px-10 py-10 lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="size-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">Inbox Faturas</div>
              <div className="text-xs text-muted-foreground">
                Email para draft revisto
              </div>
            </div>
          </div>

          <div className="max-w-md space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="size-3" />
              PT-PT + revisão humana
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            <p className="text-base text-muted-foreground">{description}</p>

            <ul className="space-y-3 text-sm">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span className="text-foreground/90">{b}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="text-xs text-muted-foreground">
            Em beta · construído em Portugal
          </div>
        </aside>

        {/* ----------------------------- Form panel ---------------------------- */}
        <section className="flex flex-col">
          <header className="flex items-center justify-between px-6 py-4 lg:px-10">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Voltar
            </Link>
            <div className="flex items-center gap-2 lg:hidden">
              <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <FileText className="size-3.5" />
              </div>
              <span className="text-sm font-semibold">Inbox Faturas</span>
            </div>
          </header>

          <div className="flex flex-1 items-center justify-center px-6 py-8 lg:px-10">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
