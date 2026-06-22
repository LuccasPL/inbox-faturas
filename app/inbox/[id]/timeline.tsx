import {
  CheckCircle2,
  CircleDashed,
  FileText,
  Inbox as InboxIcon,
  Mail,
  Paperclip,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatFullDate, formatRelativeTime } from '@/lib/format/time';

type Tone = 'amber' | 'emerald' | 'sky' | 'rose' | 'slate';

const TONE_BG: Record<Tone, string> = {
  amber:
    'bg-amber-500/12 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  emerald:
    'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  sky: 'bg-sky-500/12 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
  rose: 'bg-rose-500/12 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
  slate: 'bg-muted text-muted-foreground',
};

interface TimelineEvent {
  at: Date | null;
  tone: Tone;
  Icon: typeof CheckCircle2;
  title: string;
  detail?: string;
}

interface TimelineProps {
  email: {
    fromEmail: string;
    createdAt: Date | null;
    isFaturaRequest: string | null;
    triagemMotivo: string | null;
    triagemConfianca: string | null;
    attachments: unknown;
  };
  draft: {
    createdAt: Date | null;
    confiancaExtracao: string | null;
    reviewedAt: Date | null;
    reviewedBy: string | null;
    status: string | null;
    emittedAt: Date | null;
    emittedVia: string | null;
    moloniDocumentId: number | null;
    proformaNumero: number | null;
    proformaSentAt: Date | null;
    proformaSentTo: string | null;
    emitError: string | null;
  } | null;
}

export function DraftTimeline({ email, draft }: TimelineProps) {
  const events: TimelineEvent[] = [];

  events.push({
    at: email.createdAt,
    tone: 'slate',
    Icon: InboxIcon,
    title: 'Email recebido',
    detail: `De ${email.fromEmail}`,
  });

  if (Array.isArray(email.attachments) && email.attachments.length > 0) {
    events.push({
      at: email.createdAt,
      tone: 'slate',
      Icon: Paperclip,
      title: `${email.attachments.length} ${email.attachments.length === 1 ? 'anexo detetado' : 'anexos detetados'}`,
      detail: 'Lido como contexto pela IA',
    });
  }

  if (email.isFaturaRequest) {
    const tone: Tone =
      email.isFaturaRequest === 'sim'
        ? 'emerald'
        : email.isFaturaRequest === 'incerto'
          ? 'amber'
          : 'slate';
    const title =
      email.isFaturaRequest === 'sim'
        ? 'Triagem: pedido de fatura'
        : email.isFaturaRequest === 'incerto'
          ? 'Triagem: incerta'
          : 'Triagem: não é pedido de fatura';
    events.push({
      at: email.createdAt,
      tone,
      Icon: tone === 'slate' ? CircleDashed : CheckCircle2,
      title,
      detail: [
        email.triagemConfianca && `confiança ${email.triagemConfianca}`,
        email.triagemMotivo,
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
    });
  }

  if (draft) {
    events.push({
      at: draft.createdAt,
      tone: 'sky',
      Icon: Sparkles,
      title: 'Draft extraído pela IA',
      detail: draft.confiancaExtracao
        ? `Confiança ${draft.confiancaExtracao}`
        : undefined,
    });

    if (draft.reviewedAt && draft.status === 'rejeitado') {
      events.push({
        at: draft.reviewedAt,
        tone: 'rose',
        Icon: XCircle,
        title: 'Draft rejeitado',
        detail: draft.reviewedBy ? `por ${shortUser(draft.reviewedBy)}` : undefined,
      });
    } else if (draft.reviewedAt && draft.status === 'aprovado') {
      events.push({
        at: draft.reviewedAt,
        tone: 'emerald',
        Icon: CheckCircle2,
        title: 'Draft aprovado',
        detail: draft.reviewedBy ? `por ${shortUser(draft.reviewedBy)}` : undefined,
      });
    } else if (draft.reviewedAt) {
      events.push({
        at: draft.reviewedAt,
        tone: 'emerald',
        Icon: CheckCircle2,
        title: 'Draft revisto',
        detail: draft.reviewedBy ? `por ${shortUser(draft.reviewedBy)}` : undefined,
      });
    }

    if (draft.emittedAt && draft.emittedVia === 'pdf_proforma') {
      events.push({
        at: draft.emittedAt,
        tone: 'sky',
        Icon: FileText,
        title: 'Proforma emitida',
        detail: draft.proformaNumero
          ? `N.º ${String(draft.proformaNumero).padStart(6, '0')}`
          : undefined,
      });
    } else if (draft.emittedAt && draft.status === 'emitida') {
      events.push({
        at: draft.emittedAt,
        tone: 'emerald',
        Icon: Send,
        title: 'Fatura emitida no Moloni',
        detail: draft.moloniDocumentId
          ? `Documento #${draft.moloniDocumentId}`
          : undefined,
      });
    } else if (draft.emittedAt && draft.status === 'rascunho_moloni') {
      events.push({
        at: draft.emittedAt,
        tone: 'sky',
        Icon: FileText,
        title: 'Rascunho criado no Moloni',
        detail: draft.moloniDocumentId
          ? `Documento #${draft.moloniDocumentId}`
          : undefined,
      });
    }

    if (draft.proformaSentAt) {
      events.push({
        at: draft.proformaSentAt,
        tone: 'emerald',
        Icon: Mail,
        title: 'Proforma enviada ao cliente',
        detail: draft.proformaSentTo ?? undefined,
      });
    }

    if (draft.emitError && draft.status === 'falha_emissao') {
      events.push({
        at: draft.reviewedAt ?? draft.emittedAt ?? draft.createdAt,
        tone: 'rose',
        Icon: XCircle,
        title: 'Falha na emissão',
        detail: draft.emitError.slice(0, 200),
      });
    }
  }

  // Ordena por data ASC; eventos sem data ficam no fim
  events.sort((a, b) => {
    const ta = a.at?.getTime() ?? Infinity;
    const tb = b.at?.getTime() ?? Infinity;
    return ta - tb;
  });

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Linha do tempo</CardTitle>
        <CardDescription>
          Tudo o que aconteceu com este pedido — desde a chegada até ao fim.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-5">
          <span
            aria-hidden
            className="absolute left-[17px] top-2 bottom-2 w-px bg-border"
          />
          {events.map((ev, i) => {
            const Icon = ev.Icon;
            return (
              <li key={i} className="relative flex items-start gap-4">
                <div
                  className={`relative z-10 flex size-9 shrink-0 items-center justify-center rounded-lg ring-4 ring-card ${TONE_BG[ev.tone]}`}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-sm font-medium">{ev.title}</div>
                    {ev.at && (
                      <time
                        className="shrink-0 text-xs text-muted-foreground"
                        title={formatFullDate(ev.at)}
                      >
                        {formatRelativeTime(ev.at)}
                      </time>
                    )}
                  </div>
                  {ev.detail && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {ev.detail}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function shortUser(clerkUserId: string): string {
  const m = clerkUserId.match(/^user_([a-z0-9]+)/i);
  if (m) return `user_${m[1].slice(0, 6)}…`;
  return clerkUserId.slice(0, 10) + '…';
}
