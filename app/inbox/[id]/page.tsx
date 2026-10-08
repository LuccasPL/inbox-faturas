import Link from 'next/link';
import type { ComponentType } from 'react';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  CalendarClock,
  Mail,
  Paperclip,
  UserRound,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';
import { getOrCreateTenantForUser } from '@/lib/auth/tenant';
import { formatRelativeTime, formatFullDate } from '@/lib/format/time';
import { normalizeEmailAddress } from '@/lib/email/address';
import { safeInboxReturnHref, type InboxSearchParams } from '@/lib/inbox/filters';
import { loadOwnedEmailDetail } from '@/lib/inbox/detail';
import { DraftEditor } from './draft-editor';
import { calculationVersion } from '@/lib/faturas/totals';
import { emailDeletionBlockReason } from '@/lib/extraction/processing';
import { isEmailBusy } from '@/lib/extraction/queue-policy';
import { loadProcessingDetails } from '@/lib/extraction/queue-queries';
import { ProcessingRefresh } from '@/components/processing-refresh';
import { ProcessingStatus } from './processing-status';
import { ReprocessarButton } from './reprocessar-button';
import { EliminarButton } from './eliminar-button';
import { DraftTimeline } from './timeline';
import { AnomaliasCard } from './anomalias-card';
import {
  detectarAnomalias,
  type DraftSnapshot,
  type HistoricoSnapshot,
} from '@/lib/insights/anomalias';
import type { Item } from './items-editor';

interface PostmarkAttachment {
  Name?: string;
  ContentType?: string;
  ContentLength?: number;
}

interface RawIaResponse {
  content?: Array<{
    type: string;
    input?: {
      notas_extracao?: string;
    };
  }>;
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export default async function DetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<InboxSearchParams>;
}) {
  const { id } = await params;
  const returnHref = safeInboxReturnHref((await searchParams).returnTo);
  const tenant = await getOrCreateTenantForUser();

  const resultado = await loadOwnedEmailDetail(id, tenant.id);

  if (!resultado) {
    notFound();
  }

  const { email, draft } = resultado;
  const processing = await loadProcessingDetails(email.id, tenant.id);
  const busy = isEmailBusy(email.status);
  const items = (draft?.items as Item[] | null) ?? [];
  const attachments = (email.attachments as PostmarkAttachment[] | null) ?? [];

  const rawIaResponse = draft?.rawIaResponse as RawIaResponse | null;
  const notasIA =
    rawIaResponse?.content?.find((b) => b.type === 'tool_use')?.input
      ?.notas_extracao ?? '';

  // Anomalias: comparar o draft com o histórico confirmado deste remetente.
  // Procura por fromEmail (mais fiável) e por clienteNif (cobre re-aprovações).
  let anomalias: ReturnType<typeof detectarAnomalias> = [];
  if (draft) {
    const normalizedFromEmail = normalizeEmailAddress(email.fromEmail);
    const historicoRows = await db
      .select({
        clienteNif: faturasDraft.clienteNif,
        clienteEmail: faturasDraft.clienteEmail,
        iban: faturasDraft.iban,
        total: faturasDraft.total,
        items: faturasDraft.items,
      })
      .from(faturasDraft)
      .innerJoin(emails, eq(emails.id, faturasDraft.emailId))
      .where(
        and(
          eq(faturasDraft.tenantId, tenant.id),
          sql`lower(${emails.fromEmail}) = ${normalizedFromEmail}`,
          ne(faturasDraft.id, draft.id),
          inArray(faturasDraft.status, [
            'aprovado',
            'rascunho_moloni',
            'emitida',
            'emitida_proforma',
          ]),
        ),
      )
      .orderBy(desc(faturasDraft.createdAt))
      .limit(5);

    const snapshotDraft: DraftSnapshot = {
      clienteNif: draft.clienteNif,
      clienteEmail: draft.clienteEmail,
      iban: draft.iban,
      total: draft.total === null ? null : parseFloat(draft.total),
      items: items.map((it) => ({ descricao: it.descricao })),
    };
    const snapshotHistorico: HistoricoSnapshot[] = historicoRows.map((h) => ({
      clienteNif: h.clienteNif,
      clienteEmail: h.clienteEmail,
      iban: h.iban,
      total: h.total === null ? null : parseFloat(h.total),
      items: Array.isArray(h.items)
        ? (h.items as Array<{ descricao?: string }>).map((i) => ({
            descricao: i.descricao ?? '',
          }))
        : null,
    }));
    anomalias = detectarAnomalias(snapshotDraft, snapshotHistorico);
  }

  return (
    <AppShell
      active="inbox"
      title="Revisão do pedido"
      description={email.subject || '(sem assunto)'}
      actions={
        <>
          <Button variant="outline" asChild>
            <Link href={returnHref}>
              <ArrowLeft className="size-4" />
              Inbox
            </Link>
          </Button>
          {!busy && <ReprocessarButton emailId={email.id} />}
          <ProcessingRefresh active={busy} />
          <EliminarButton emailId={email.id} blockedReason={emailDeletionBlockReason(email.status, draft ? [draft] : [])} />
        </>
      }
    >
      <ProcessingStatus details={processing} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(440px,1.08fr)]">
        <section className="rounded-lg border bg-background">
          <div className="border-b px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Email original</Badge>
              {email.isFaturaRequest === 'incerto' && (
                <Badge variant="secondary">Triagem incerta</Badge>
              )}
              {attachments.length > 0 && (
                <Badge variant="secondary">
                  <Paperclip className="size-3" />
                  {attachments.length}
                </Badge>
              )}
            </div>
            <h2 className="mt-3 text-lg font-semibold tracking-tight">
              {email.subject || '(sem assunto)'}
            </h2>
          </div>

          <div className="grid gap-3 px-5 py-4 text-sm">
            <MetaRow icon={UserRound} label="De" value={email.fromEmail} />
            <MetaRow icon={Mail} label="Para" value={email.toEmail} />
            <MetaRow
              icon={CalendarClock}
              label="Recebido"
              value={formatRelativeTime(email.createdAt)}
              title={formatFullDate(email.createdAt)}
            />
          </div>

          <Separator />

          <div className="max-h-[52rem] overflow-auto px-5 py-5">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">
              {email.bodyText || '(sem corpo de email)'}
            </pre>
          </div>

          {attachments.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2 px-5 py-4">
                <div className="text-xs font-medium text-muted-foreground">
                  Anexos
                </div>
                <div className="grid gap-2">
                  {attachments.map((att, i) => (
                    <a
                      key={i}
                      href={`/api/emails/${email.id}/attachments/${i}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-sm transition-colors hover:bg-muted"
                    >
                      <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {att.Name ?? `attachment-${i}`}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatBytes(att.ContentLength)}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        <section className="rounded-lg border bg-background">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <Badge variant="outline">Draft</Badge>
              <h2 className="mt-2 text-lg font-semibold tracking-tight">
                Dados para fatura
              </h2>
            </div>
            {draft?.confiancaExtracao && (
              <Badge
                variant={
                  draft.confiancaExtracao === 'alta'
                    ? 'default'
                    : draft.confiancaExtracao === 'media'
                      ? 'secondary'
                      : 'destructive'
                }
              >
                {draft.confiancaExtracao}
              </Badge>
            )}
          </div>

          <div className="p-5">
            {(!draft || busy) && (
              <div className="border-l-2 border-primary/40 py-2 pl-4 text-sm">
                <p>{busy ? 'A preparar os dados do pedido.' : email.status === 'ignored'
                  ? 'Este email foi classificado como não-fatura.' : 'Ainda não há dados extraídos disponíveis.'}</p>
              </div>
            )}

            {draft && !busy && (
              <DraftEditor
                draftId={draft.id}
                emissaoVia={
                  tenant.emissaoVia === 'pdf_proforma'
                    ? 'pdf_proforma'
                    : 'moloni'
                }
                status={draft.status || 'pendente_revisao'}
                confianca={draft.confiancaExtracao}
                notasIA={notasIA}
                moloni={{
                  documentId: draft.moloniDocumentId,
                  emittedAt: draft.emittedAt
                    ? draft.emittedAt.toISOString()
                    : null,
                  error: draft.emitError,
                }}
                proforma={{
                  calculoVersao: calculationVersion(draft.dadosFinais),
                  numero: draft.proformaNumero,
                  emittedAt: draft.emittedAt
                    ? draft.emittedAt.toISOString()
                    : null,
                  sentAt: draft.proformaSentAt
                    ? draft.proformaSentAt.toISOString()
                    : null,
                  sentTo: draft.proformaSentTo,
                  shareToken: draft.proformaShareToken,
                  shareExpiresAt: draft.proformaShareExpiresAt?.toISOString() ?? null,
                  shareReferenceTime: Date.parse(resultado.shareReferenceTime),
                  shareOpenedAt: draft.proformaShareOpenedAt
                    ? draft.proformaShareOpenedAt.toISOString()
                    : null,
                }}
                initial={{
                  clienteNome: draft.clienteNome,
                  clienteNif: draft.clienteNif,
                  clienteEmail: draft.clienteEmail,
                  clienteMorada: draft.clienteMorada,
                  items,
                  subtotal: draft.subtotal,
                  ivaValor: draft.ivaValor,
                  total: draft.total,
                  iban: draft.iban,
                  prazoPagamento: draft.prazoPagamento,
                  observacoes: draft.observacoes,
                }}
              />
            )}
          </div>
        </section>
      </div>

      {anomalias.length > 0 && (
        <div className="mt-6">
          <AnomaliasCard anomalias={anomalias} />
        </div>
      )}

      <div className="mt-6">
        <DraftTimeline email={email} draft={draft ?? null} />
      </div>
    </AppShell>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
  title,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="grid grid-cols-[1.25rem_5rem_1fr] items-center gap-2">
      <Icon className="size-4 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium" title={title}>
        {value}
      </span>
    </div>
  );
}
