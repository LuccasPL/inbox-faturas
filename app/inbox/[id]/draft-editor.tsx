'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Check,
  CheckCircle2,
  FileText,
  FilePlus2,
  Link as LinkIcon,
  Loader2,
  Send,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isValidNifPt } from '@/lib/validation/nif-pt';
import { formatFullDate, formatRelativeTime } from '@/lib/format/time';
import {
  aprovarDraft,
  atualizarDraft,
  emitirFatura,
  enviarProforma,
  gerarLinkProforma,
  rejeitarDraft,
} from './actions';
import { ItemsEditor, type Item } from './items-editor';

interface DraftEditorProps {
  draftId: string;
  emissaoVia: 'moloni' | 'pdf_proforma';
  status: string;
  confianca: string | null;
  notasIA: string;
  moloni: {
    documentId: number | null;
    emittedAt: string | null;
    error: string | null;
  };
  proforma?: {
    numero: number | null;
    emittedAt: string | null;
    sentAt: string | null;
    sentTo: string | null;
    shareToken: string | null;
    shareOpenedAt: string | null;
  };
  initial: {
    clienteNome: string | null;
    clienteNif: string | null;
    clienteEmail: string | null;
    clienteMorada: string | null;
    items: Item[];
    subtotal: string | null;
    ivaValor: string | null;
    total: string | null;
    iban: string | null;
    prazoPagamento: string | null;
    observacoes: string | null;
  };
}

function computeTotals(items: Item[]) {
  let subtotal = 0;
  let ivaValor = 0;
  for (const it of items) {
    const linha = (it.quantidade ?? 0) * (it.preco_unitario ?? 0);
    subtotal += linha;
    ivaValor += linha * ((it.iva_percentagem ?? 0) / 100);
  }
  return {
    subtotal: round2(subtotal),
    ivaValor: round2(ivaValor),
    total: round2(subtotal + ivaValor),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function EditableField({
  label,
  value,
  onSave,
  placeholder = '-',
  type = 'text',
  className = '',
}: {
  label: string;
  value: string | null;
  onSave: (newValue: string) => Promise<void>;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value || '');
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    if (draftValue === (value || '')) {
      setIsEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await onSave(draftValue);
        toast.success(`${label} atualizado`);
        setIsEditing(false);
      } catch {
        toast.error('Erro ao guardar');
      }
    });
  };

  const handleCancel = () => {
    setDraftValue(value || '');
    setIsEditing(false);
  };

  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {isEditing ? (
        <div className="flex items-center gap-1">
          <Input
            type={type}
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
            autoFocus
            disabled={isPending}
            className="h-9"
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-9"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-9"
            onClick={handleCancel}
            disabled={isPending}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <div
          onClick={() => setIsEditing(true)}
          className="min-h-9 cursor-text rounded-lg border bg-muted/20 px-3 py-2 font-medium transition-colors hover:bg-muted/45"
        >
          {value || <span className="text-muted-foreground">{placeholder}</span>}
        </div>
      )}
    </div>
  );
}

export function DraftEditor({
  draftId,
  emissaoVia,
  status,
  confianca,
  notasIA,
  moloni,
  proforma,
  initial,
}: DraftEditorProps) {
  const router = useRouter();
  const [isApproving, startApproveTransition] = useTransition();
  const [isRejecting, startRejectTransition] = useTransition();
  const [isEmitting, startEmitTransition] = useTransition();
  const [isSending, startSendTransition] = useTransition();
  const [isSharing, startShareTransition] = useTransition();

  const [items, setItems] = useState<Item[]>(initial.items);
  const computed = computeTotals(items);

  async function saveItems(next: Item[]) {
    setItems(next);
    const totals = computeTotals(next);
    await atualizarDraft(draftId, {
      items: next,
      subtotal: totals.subtotal,
      ivaValor: totals.ivaValor,
      total: totals.total,
    });
    router.refresh();
  }

  const saveField = (field: string) => async (newValue: string) => {
    const parsedValue =
      field === 'subtotal' || field === 'ivaValor' || field === 'total'
        ? newValue
          ? parseFloat(newValue)
          : null
        : newValue || null;
    await atualizarDraft(draftId, { [field]: parsedValue });
  };

  const handleAprovar = () => {
    startApproveTransition(async () => {
      try {
        await aprovarDraft(draftId);
        toast.success('Draft aprovado');
        router.push('/inbox');
      } catch {
        toast.error('Erro ao aprovar');
      }
    });
  };

  const handleRejeitar = () => {
    if (!confirm('Tens a certeza que queres rejeitar este draft?')) return;
    startRejectTransition(async () => {
      try {
        await rejeitarDraft(draftId);
        toast.success('Draft rejeitado');
        router.push('/inbox');
      } catch {
        toast.error('Erro ao rejeitar');
      }
    });
  };

  const handleEmitir = (finalize: boolean) => {
    const msg = finalize
      ? emissaoVia === 'pdf_proforma'
        ? null
        : 'Emitir fatura FINAL no Moloni? Vai ser numerada e comunicada à AT.'
      : null;
    if (msg && !confirm(msg)) return;
    startEmitTransition(async () => {
      const res = await emitirFatura(draftId, { finalize });
      if (!res.ok) {
        toast.error(res.error ?? 'Erro ao emitir');
        return;
      }
      if (emissaoVia === 'pdf_proforma') {
        const numero = res.proformaNumero
          ? String(res.proformaNumero).padStart(6, '0')
          : null;
        if (res.sentTo) {
          toast.success(
            numero
              ? `Proforma ${numero} emitida e enviada para ${res.sentTo}`
              : `Proforma emitida e enviada para ${res.sentTo}`,
          );
        } else if (res.warning) {
          toast.success(res.warning);
        } else {
          toast.success(
            numero ? `Proforma emitida (n.º ${numero})` : 'Proforma emitida',
          );
        }
      } else {
        toast.success(
          finalize
            ? `Fatura emitida (n.º ${res.documentNumber})`
            : `Rascunho criado no Moloni (#${res.documentId})`,
        );
      }
      router.refresh();
    });
  };

  const isReadOnly =
    status === 'aprovado' ||
    status === 'rejeitado' ||
    status === 'rascunho_moloni' ||
    status === 'emitida' ||
    status === 'emitida_proforma' ||
    status === 'emissao_em_curso';
  const isMoloniDraft = status === 'rascunho_moloni';
  const isEmitted = status === 'emitida';
  const isProformaEmitida = status === 'emitida_proforma';
  const isEmittingStatus = status === 'emissao_em_curso';
  const isPdfProformaMode = emissaoVia === 'pdf_proforma';
  const anyPending = isApproving || isRejecting || isEmitting;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {status === 'aprovado' && <Badge>Aprovado</Badge>}
          {status === 'rejeitado' && <Badge variant="destructive">Rejeitado</Badge>}
          {status === 'pendente_revisao' && (
            <Badge variant="outline">Pendente revisão</Badge>
          )}
          {isMoloniDraft && <Badge variant="secondary">Rascunho Moloni</Badge>}
          {isEmitted && <Badge>Emitida</Badge>}
          {isProformaEmitida && <Badge>Proforma emitida</Badge>}
          {isEmittingStatus && (
            <Badge variant="secondary">Emissão em curso</Badge>
          )}
          {status === 'falha_emissao' && (
            <Badge variant="destructive">Falha emissão</Badge>
          )}
        </div>
        {confianca && (
          <Badge
            variant={
              confianca === 'alta'
                ? 'default'
                : confianca === 'media'
                  ? 'secondary'
                  : 'destructive'
            }
          >
            Confiança IA: {confianca}
          </Badge>
        )}
      </div>

      {/* ---------------------------- Cliente ---------------------------- */}
      <FieldGroup title="Cliente">
        <EditableField
          label="Nome"
          value={initial.clienteNome}
          onSave={saveField('clienteNome')}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <EditableField
              label="NIF"
              value={initial.clienteNif}
              onSave={saveField('clienteNif')}
            />
            {initial.clienteNif && !isValidNifPt(initial.clienteNif) && (
              <p className="mt-1.5 text-xs text-destructive">
                NIF inválido — checksum não bate
              </p>
            )}
          </div>
          <EditableField
            label="Email"
            value={initial.clienteEmail}
            onSave={saveField('clienteEmail')}
          />
        </div>

        <EditableField
          label="Morada"
          value={initial.clienteMorada}
          onSave={saveField('clienteMorada')}
        />
      </FieldGroup>

      {/* ---------------------------- Items ------------------------------ */}
      <FieldGroup title="Items">
        <ItemsEditor items={items} disabled={isReadOnly} onChange={saveItems} />

        <div className="grid grid-cols-3 overflow-hidden rounded-lg border text-sm">
          <TotalBox label="Subtotal" value={computed.subtotal} />
          <TotalBox label="IVA" value={computed.ivaValor} />
          <TotalBox label="Total" value={computed.total} strong />
        </div>
      </FieldGroup>

      {/* ---------------------------- Pagamento -------------------------- */}
      <FieldGroup title="Pagamento">
        <div className="grid gap-4 md:grid-cols-2">
          <EditableField
            label="IBAN"
            value={initial.iban}
            onSave={saveField('iban')}
          />
          <EditableField
            label="Prazo"
            value={initial.prazoPagamento}
            onSave={saveField('prazoPagamento')}
          />
        </div>

        <EditableField
          label="Observações"
          value={initial.observacoes}
          onSave={saveField('observacoes')}
        />
      </FieldGroup>

      {/* ---------------------------- Insights --------------------------- */}
      {notasIA && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-medium">
            <Sparkles className="size-3.5 text-primary" />
            Notas da extração
          </div>
          <div className="text-sm text-muted-foreground">{notasIA}</div>
        </div>
      )}

      {proforma?.numero && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-medium">
            <FileText className="size-3.5" />
            Proforma
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
            <div>
              N.º{' '}
              <strong className="tabular-nums">
                {String(proforma.numero).padStart(6, '0')}
              </strong>
              {proforma.emittedAt && (
                <span
                  className="ml-2 text-muted-foreground"
                  title={formatFullDate(proforma.emittedAt)}
                >
                  {formatRelativeTime(proforma.emittedAt)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/faturas/${draftId}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Abrir PDF
              </a>
              <button
                type="button"
                onClick={() => {
                  startShareTransition(async () => {
                    const res = await gerarLinkProforma(draftId);
                    if (!res.ok || !res.url) {
                      toast.error(res.error ?? 'Erro ao gerar link');
                      return;
                    }
                    try {
                      await navigator.clipboard.writeText(res.url);
                      toast.success('Link copiado para a área de transferência');
                    } catch {
                      toast.success(`Link: ${res.url}`);
                    }
                    router.refresh();
                  });
                }}
                disabled={isSharing}
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                {isSharing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <LinkIcon className="size-3.5" />
                )}
                {proforma.shareToken
                  ? 'Copiar link'
                  : 'Gerar link público'}
              </button>
              {!proforma.sentAt && initial.clienteEmail && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !confirm(
                        `Enviar proforma para ${initial.clienteEmail} com o PDF em anexo?`,
                      )
                    )
                      return;
                    startSendTransition(async () => {
                      const res = await enviarProforma(draftId);
                      if (!res.ok) {
                        toast.error(res.error ?? 'Erro ao enviar');
                        return;
                      }
                      toast.success(`Enviado para ${res.sentTo}`);
                      router.refresh();
                    });
                  }}
                  disabled={isSending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
                >
                  {isSending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                  {isSending ? 'A enviar...' : 'Enviar ao cliente'}
                </button>
              )}
            </div>
          </div>
          {proforma.sentAt && (
            <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
              Enviado para{' '}
              <strong>{proforma.sentTo}</strong>{' '}
              <span
                className="text-muted-foreground"
                title={formatFullDate(proforma.sentAt)}
              >
                · {formatRelativeTime(proforma.sentAt)}
              </span>
            </div>
          )}
          {proforma.shareToken && (
            <div className="mt-1 text-xs text-muted-foreground">
              Link público ativo
              {proforma.shareOpenedAt && (
                <span title={formatFullDate(proforma.shareOpenedAt)}>
                  {' '}· aberto pela 1.ª vez{' '}
                  {formatRelativeTime(proforma.shareOpenedAt)}
                </span>
              )}
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Documento proforma — sem valor fiscal. Para fatura legal usa o
            Moloni.
          </p>
        </div>
      )}

      {(moloni.documentId || moloni.error) && (
        <div
          className={
            moloni.error
              ? 'rounded-lg border border-destructive/30 bg-destructive/5 p-4'
              : 'rounded-lg border bg-muted/30 p-4'
          }
        >
          <div className="mb-1.5 flex items-center gap-2 text-xs font-medium">
            <FileText className="size-3.5" />
            Moloni
          </div>
          {moloni.documentId && (
            <div className="text-sm">
              Documento{' '}
              <strong className="tabular-nums">#{moloni.documentId}</strong>
              {moloni.emittedAt && (
                <span
                  className="ml-2 text-muted-foreground"
                  title={formatFullDate(moloni.emittedAt)}
                >
                  {formatRelativeTime(moloni.emittedAt)}
                </span>
              )}
            </div>
          )}
          {isMoloniDraft && (
            <div className="mt-1 text-xs text-muted-foreground">
              O rascunho já foi criado no Moloni. Finaliza-o no próprio Moloni
              para evitar documentos duplicados.
            </div>
          )}
          {moloni.error && (
            <div className="mt-1 text-sm text-destructive">{moloni.error}</div>
          )}
        </div>
      )}

      {!isReadOnly && (
        <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t bg-background/95 px-5 py-4 backdrop-blur">
          <Button onClick={handleAprovar} disabled={anyPending}>
            {isApproving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                A aprovar...
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                Aprovar
              </>
            )}
          </Button>

          {!isPdfProformaMode && !isMoloniDraft && (
            <Button
              variant="secondary"
              onClick={() => handleEmitir(false)}
              disabled={anyPending}
            >
              {isEmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  A emitir...
                </>
              ) : (
                <>
                  <FilePlus2 className="size-4" />
                  Rascunho Moloni
                </>
              )}
            </Button>
          )}

          <Button
            variant="default"
            onClick={() => handleEmitir(true)}
            disabled={anyPending}
          >
            {isEmitting ? (
              'A emitir...'
            ) : (
              <>
                {isPdfProformaMode ? (
                  <FileText className="size-4" />
                ) : (
                  <Send className="size-4" />
                )}
                {isPdfProformaMode ? 'Emitir proforma' : 'Emitir final'}
              </>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={handleRejeitar}
            disabled={anyPending}
          >
            {isRejecting ? (
              'A rejeitar...'
            ) : (
              <>
                <XCircle className="size-4" />
                Rejeitar
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function TotalBox({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  const fmt = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  });
  return (
    <div
      className={
        strong
          ? 'border-l bg-muted/40 p-3'
          : 'p-3'
      }
    >
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <div
        className={
          strong
            ? 'text-base font-semibold tabular-nums'
            : 'font-medium tabular-nums'
        }
      >
        {fmt.format(value)}
      </div>
    </div>
  );
}

function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
