import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { Anomalia } from '@/lib/insights/anomalias';

interface Props {
  anomalias: Anomalia[];
}

const SEVERITY_BG = {
  alert:
    'bg-rose-500/12 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
  warning:
    'bg-amber-500/12 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  info: 'bg-sky-500/12 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
} as const;

const SEVERITY_CONTAINER = {
  alert:
    'border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/15',
  warning:
    'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/15',
  info: 'border-sky-200 bg-sky-50/40 dark:border-sky-900/40 dark:bg-sky-950/10',
} as const;

const SEVERITY_ICON = {
  alert: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export function AnomaliasCard({ anomalias }: Props) {
  if (anomalias.length === 0) return null;

  // Container picks the highest severity present
  const overall: keyof typeof SEVERITY_CONTAINER = anomalias.some(
    (a) => a.severity === 'alert',
  )
    ? 'alert'
    : anomalias.some((a) => a.severity === 'warning')
      ? 'warning'
      : 'info';

  return (
    <section
      className={`rounded-lg border p-4 ${SEVERITY_CONTAINER[overall]}`}
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4" />
        Sinalizado pela análise do histórico ({anomalias.length})
      </div>
      <ul className="grid gap-2">
        {anomalias.map((a) => {
          const Icon = SEVERITY_ICON[a.severity];
          return (
            <li
              key={a.key}
              className="flex items-start gap-3 rounded-lg bg-background/70 px-3 py-2"
            >
              <span
                className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${SEVERITY_BG[a.severity]}`}
              >
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium">{a.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {a.description}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
