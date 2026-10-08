import { CircleAlert, CircleCheck, Minus, ShieldCheck } from 'lucide-react';
import type { ReadinessItem } from '@/lib/settings/readiness';

export function ConfigurationStatus({ items }: { items: ReadinessItem[] }) {
  const pending = items.filter(item => item.state === 'missing').length;
  return (
    <section className="min-w-0 border-y py-5" aria-labelledby="configuration-status-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="configuration-status-title" className="flex items-center gap-2 text-base font-semibold"><ShieldCheck aria-hidden className="size-4" />Diagnóstico de configuração</h2>
        <span className="text-xs text-muted-foreground">{pending ? `${pending} ${pending === 1 ? 'ponto pendente' : 'pontos pendentes'}` : 'Sem configuração obrigatória em falta'}</span>
      </div>
      <dl className="mt-3 grid gap-x-8 md:grid-cols-2">
        {items.map(item => {
          const Icon = item.state === 'missing' ? CircleAlert : item.state === 'configured' ? CircleCheck : Minus;
          return (
            <div key={item.id} className="min-w-0 border-b py-4 last:border-b-0">
              <dt className="flex items-start gap-2 text-sm font-medium"><Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${item.state === 'missing' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`} />{item.label}</dt>
              <dd className="ml-6 mt-1 min-w-0">
                <span className={`text-xs font-medium ${item.state === 'missing' ? 'text-amber-700 dark:text-amber-400' : item.state === 'configured' ? 'text-primary' : 'text-muted-foreground'}`}>{item.value}</span>
                <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
