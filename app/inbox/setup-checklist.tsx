import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Check, AlertCircle } from 'lucide-react';

interface TenantStatus {
  emailInbound: string;
  moloniConfigured: boolean;
}

interface ChecklistItem {
  done: boolean;
  label: string;
  description: string;
  action?: { label: string; href: string };
}

function buildChecklist(t: TenantStatus): ChecklistItem[] {
  return [
    {
      done: !t.emailInbound.endsWith('@pending.invalid'),
      label: 'Define o email inbound real',
      description:
        'O endereço que recebe os emails dos clientes (vem do Postmark).',
      action: { label: 'Configurar', href: '/settings' },
    },
    {
      done: t.moloniConfigured,
      label: 'Liga a tua conta Moloni',
      description:
        'Sem isto não consegues emitir faturas reais — só rever drafts.',
      action: { label: 'Ligar', href: '/settings' },
    },
  ];
}

export function SetupChecklist({ tenant }: { tenant: TenantStatus }) {
  const items = buildChecklist(tenant);
  const pending = items.filter((i) => !i.done);

  if (pending.length === 0) return null;

  return (
    <Card className="mb-6 border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/20">
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
          Setup pendente ({pending.length}{' '}
          {pending.length === 1 ? 'item' : 'itens'})
        </div>

        <ul className="space-y-2">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-3 text-sm"
            >
              <span
                className={
                  item.done
                    ? 'mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white shrink-0'
                    : 'mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/40 shrink-0'
                }
              >
                {item.done && <Check className="h-3 w-3" />}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className={
                    item.done
                      ? 'line-through text-muted-foreground'
                      : 'font-medium'
                  }
                >
                  {item.label}
                </div>
                {!item.done && (
                  <div className="text-xs text-muted-foreground">
                    {item.description}
                  </div>
                )}
              </div>
              {!item.done && item.action && (
                <Link
                  href={item.action.href}
                  className="text-xs underline shrink-0 hover:text-primary"
                >
                  {item.action.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
