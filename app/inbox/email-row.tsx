import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  FileText,
  HelpCircle,
  Loader2,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime, formatFullDate } from '@/lib/format/time';

/* -------------------------------------------------------------------------- */
/*  Shared building blocks                                                    */
/* -------------------------------------------------------------------------- */

type IconTone = 'amber' | 'emerald' | 'sky' | 'rose' | 'slate';

const TONE_CLASSES: Record<IconTone, string> = {
  amber:
    'bg-amber-500/12 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  emerald:
    'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  sky: 'bg-sky-500/12 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
  rose: 'bg-rose-500/12 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
  slate:
    'bg-muted text-muted-foreground',
};

function StatusIcon({
  tone,
  children,
}: {
  tone: IconTone;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}
    >
      {children}
    </div>
  );
}

function formatEur(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n);
}

interface RowShellProps {
  href: string;
  children: React.ReactNode;
  /** Clica = abre o detalhe; opcional para casos onde já há link interno */
  clickable?: boolean;
}

function RowShell({ href, children, clickable = true }: RowShellProps) {
  const base =
    'group flex items-start gap-4 px-5 py-3.5 transition-colors first:rounded-t-none last:rounded-b-lg';
  if (!clickable) {
    return <div className={base}>{children}</div>;
  }
  return (
    <Link href={href} className={`${base} hover:bg-muted/50`}>
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  Por rever                                                                 */
/* -------------------------------------------------------------------------- */

interface PorReverProps {
  email: {
    id: string;
    fromEmail: string;
    subject: string | null;
    status: string | null;
    isFaturaRequest: string | null;
    createdAt: Date | null;
  };
  draft: {
    status: string | null;
    confiancaExtracao: string | null;
    clienteNome: string | null;
    clienteNif: string | null;
    total: string | null;
  } | null;
}

export function PorReverRow({ email, draft }: PorReverProps) {
  // Decide tom + ícone
  let tone: IconTone = 'amber';
  let Icon = HelpCircle;
  if (draft?.status === 'falha_emissao') {
    tone = 'rose';
    Icon = XCircle;
  } else if (email.status === 'processing' && !draft) {
    tone = 'sky';
    Icon = Loader2;
  } else if (email.status === 'extraction_failed' && !draft) {
    tone = 'rose';
    Icon = AlertCircle;
  } else if (draft) {
    tone = 'amber';
    Icon = FileText;
  } else if (email.isFaturaRequest === 'incerto') {
    tone = 'amber';
    Icon = HelpCircle;
  }

  const total = formatEur(draft?.total);

  return (
    <RowShell href={`/inbox/${email.id}`}>
      <StatusIcon tone={tone}>
        <Icon
          className={`size-4 ${email.status === 'processing' && !draft ? 'animate-spin' : ''}`}
        />
      </StatusIcon>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="truncate text-sm font-medium">
            {draft?.clienteNome || email.fromEmail}
          </div>
          <time
            className="shrink-0 text-xs text-muted-foreground"
            title={formatFullDate(email.createdAt)}
          >
            {formatRelativeTime(email.createdAt)}
          </time>
        </div>

        <div className="mt-0.5 truncate text-sm text-muted-foreground">
          {email.subject || '(sem assunto)'}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {email.isFaturaRequest === 'incerto' && (
            <Badge variant="outline" className="font-normal">
              Triagem incerta
            </Badge>
          )}
          {draft?.status === 'pendente_revisao' && (
            <Badge variant="outline" className="font-normal">
              Pendente revisão
            </Badge>
          )}
          {draft?.status === 'falha_emissao' && (
            <Badge variant="destructive" className="font-normal">
              Falha emissão
            </Badge>
          )}
          {email.status === 'extraction_failed' && !draft && (
            <Badge variant="destructive" className="font-normal">
              Extração falhou
            </Badge>
          )}
          {email.status === 'processing' && !draft && (
            <span className="text-xs text-muted-foreground">A processar…</span>
          )}
          {draft?.confiancaExtracao && (
            <span className="text-xs text-muted-foreground">
              · IA: {draft.confiancaExtracao}
            </span>
          )}
          {draft?.clienteNif && (
            <span className="text-xs text-muted-foreground">
              · NIF {draft.clienteNif}
            </span>
          )}
        </div>
      </div>

      {total && (
        <div className="shrink-0 text-right">
          <div className="text-sm font-medium tabular-nums">{total}</div>
        </div>
      )}
    </RowShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Concluídas                                                                */
/* -------------------------------------------------------------------------- */

interface ConcluidaProps {
  email: {
    id: string;
    fromEmail: string;
    createdAt: Date | null;
  };
  draft: {
    status: string | null;
    clienteNome: string | null;
    clienteNif: string | null;
    total: string | null;
    moloniDocumentId: number | null;
  };
}

export function ConcluidaRow({ email, draft }: ConcluidaProps) {
  const status = draft.status;
  let tone: IconTone = 'emerald';
  let label = 'Concluída';
  let Icon = CheckCircle2;
  if (status === 'emitida') {
    tone = 'emerald';
    label = 'Emitida';
    Icon = CheckCircle2;
  } else if (status === 'rascunho_moloni') {
    tone = 'sky';
    label = 'Rascunho Moloni';
    Icon = FileText;
  } else if (status === 'aprovado') {
    tone = 'slate';
    label = 'Aprovada';
    Icon = CheckCircle2;
  } else if (status === 'rejeitado') {
    tone = 'rose';
    label = 'Rejeitada';
    Icon = XCircle;
  }

  const total = formatEur(draft.total);

  return (
    <RowShell href={`/inbox/${email.id}`}>
      <StatusIcon tone={tone}>
        <Icon className="size-4" />
      </StatusIcon>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="truncate text-sm font-medium">
            {draft.clienteNome || email.fromEmail}
          </div>
          <time
            className="shrink-0 text-xs text-muted-foreground"
            title={formatFullDate(email.createdAt)}
          >
            {formatRelativeTime(email.createdAt)}
          </time>
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{label}</span>
          {draft.clienteNif && <span>· NIF {draft.clienteNif}</span>}
          {draft.moloniDocumentId && (
            <span>· Moloni #{draft.moloniDocumentId}</span>
          )}
        </div>
      </div>

      {total && (
        <div className="shrink-0 text-right">
          <div className="text-sm font-medium tabular-nums">{total}</div>
        </div>
      )}
    </RowShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Ignorados                                                                 */
/* -------------------------------------------------------------------------- */

interface IgnoradoProps {
  email: {
    id: string;
    fromEmail: string;
    subject: string | null;
    triagemMotivo: string | null;
    createdAt: Date | null;
  };
  /** Botão de reclassificar (server component injectado pelo pai) */
  action?: React.ReactNode;
}

export function IgnoradoRow({ email, action }: IgnoradoProps) {
  return (
    <RowShell href={`/inbox/${email.id}`} clickable={!action}>
      <StatusIcon tone="slate">
        <CircleDashed className="size-4" />
      </StatusIcon>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="truncate text-sm text-muted-foreground">
            {email.fromEmail}
          </div>
          <time
            className="shrink-0 text-xs text-muted-foreground"
            title={formatFullDate(email.createdAt)}
          >
            {formatRelativeTime(email.createdAt)}
          </time>
        </div>
        <div className="mt-0.5 truncate text-sm">
          {email.subject || '(sem assunto)'}
        </div>
        {email.triagemMotivo && (
          <div className="mt-1 truncate text-xs italic text-muted-foreground">
            {email.triagemMotivo}
          </div>
        )}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </RowShell>
  );
}
