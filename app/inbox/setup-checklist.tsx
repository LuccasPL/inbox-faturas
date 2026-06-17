import Link from 'next/link';
import { AlertCircle, ArrowRight, Check } from 'lucide-react';

interface TenantStatus {
  emailInbound: string;
  emissaoVia: string | null;
  moloniConfigured: boolean;
}

interface ChecklistItem {
  done: boolean;
  label: string;
  description: string;
  action?: { label: string; href: string };
}

function buildChecklist(t: TenantStatus): ChecklistItem[] {
  const items: ChecklistItem[] = [
    {
      done: !t.emailInbound.endsWith('@pending.invalid'),
      label: 'Email inbound real',
      description: 'Endereço que recebe pedidos dos clientes.',
      action: { label: 'Configurar', href: '/settings' },
    },
  ];

  if (t.emissaoVia !== 'pdf_proforma') {
    items.push({
      done: t.moloniConfigured,
      label: 'Moloni ligado',
      description: 'Necessário para criar documentos no ERP.',
      action: { label: 'Ligar', href: '/settings' },
    });
  }

  return items;
}

export function SetupChecklist({ tenant }: { tenant: TenantStatus }) {
  const items = buildChecklist(tenant);
  const pending = items.filter((i) => !i.done);

  if (pending.length === 0) return null;

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-amber-500/15 p-2 text-amber-700 dark:text-amber-400">
            <AlertCircle className="size-4" />
          </div>
          <div>
            <div className="text-sm font-medium">
              Setup pendente ({pending.length})
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Completa estes pontos para fechar o fluxo end-to-end.
            </div>
          </div>
        </div>

        <div className="grid gap-2 md:min-w-96">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-lg bg-background/70 px-3 py-2 text-sm"
            >
              <span
                className={
                  item.done
                    ? 'flex size-5 items-center justify-center rounded-full bg-emerald-600 text-white'
                    : 'flex size-5 items-center justify-center rounded-full border border-amber-500/50'
                }
              >
                {item.done && <Check className="size-3" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className={item.done ? 'text-muted-foreground' : ''}>
                  {item.label}
                </div>
                {!item.done && (
                  <div className="truncate text-xs text-muted-foreground">
                    {item.description}
                  </div>
                )}
              </div>
              {!item.done && item.action && (
                <Link
                  href={item.action.href}
                  className="flex items-center gap-1 text-xs font-medium text-amber-800 hover:underline dark:text-amber-300"
                >
                  {item.action.label}
                  <ArrowRight className="size-3" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
