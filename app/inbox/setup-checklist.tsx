import Link from 'next/link';
import { AlertCircle, ArrowRight } from 'lucide-react';
import type { ReadinessItem } from '@/lib/settings/readiness';

export function SetupChecklist({ items }: { items: ReadinessItem[] }) {
  const pending = items.filter(item => item.state === 'missing');
  if (!pending.length) return null;
  return (
    <section className="min-w-0 border-y border-amber-200 py-4 dark:border-amber-900/50" aria-label="Configuração pendente">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium"><AlertCircle aria-hidden className="size-4 text-amber-700 dark:text-amber-400" />Configuração pendente ({pending.length})</h2>
        <Link href="/settings" prefetch={false} className="flex items-center gap-1 text-xs font-medium text-primary">Definições<ArrowRight aria-hidden className="size-3" /></Link>
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {pending.map(item => <li key={item.id} className="min-w-0 text-xs"><span className="font-medium">{item.label}</span><span className="ml-2 text-muted-foreground">{item.value}</span></li>)}
      </ul>
    </section>
  );
}
