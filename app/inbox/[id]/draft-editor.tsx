'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Check,
  CheckCircle2,
  FilePlus2,
  Loader2,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { isValidNifPt } from '@/lib/validation/nif-pt';
import {
  aprovarDraft,
  atualizarDraft,
  emitirFatura,
  rejeitarDraft,
} from './actions';
import { ItemsEditor, type Item } from './items-editor';

interface DraftEditorProps {
  draftId: string;
  status: string;
  confianca: string | null;
  notasIA: string;
  moloni: {
    documentId: number | null;
    emittedAt: string | null;
    error: string | null;
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
  status,
  confianca,
  notasIA,
  moloni,
  initial,
}: DraftEditorProps) {
  const router = useRouter();
  const [isApproving, startApproveTransition] = useTransition();
  const [isRejecting, startRejectTransition] = useTransition();
  const [isEmitting, startEmitTransition] = useTransition();

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
      ? 'Emitir fatura FINAL no Moloni? Vai ser numerada e comunicada a AT.'
      : null;
    if (msg && !confirm(msg)) return;
    startEmitTransition(async () => {
      const res = await emitirFatura(draftId, { finalize });
      if (!res.ok) {
        toast.error(res.error ?? 'Erro ao emitir');
        return;
      }
      toast.success(
        finalize
          ? `Fatura emitida (n. ${res.documentNumber})`
          : `Rascunho criado no Moloni (#${res.documentId})`,
      );
      router.refresh();
    });
  };

  const isReadOnly =
    status === 'aprovado' ||
    status === 'rejeitado' ||
    status === 'rascunho_moloni' ||
    status === 'emitida' ||
    status === 'emissao_em_curso';
  const isMoloniDraft = status === 'rascunho_moloni';
  const isEmitted = status === 'emitida';
  const isEmittingStatus = status === 'emissao_em_curso';
  const anyPending = isApproving || isRejecting || isEmitting;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {status === 'aprovado' && <Badge>Aprovado</Badge>}
          {status === 'rejeitado' && <Badge variant="destructive">Rejeitado</Badge>}
          {status === 'pendente_revisao' && (
            <Badge variant="outline">Pendente revisao</Badge>
          )}
          {isMoloniDraft && <Badge variant="secondary">Rascunho Moloni</Badge>}
          {isEmitted && <Badge>Emitida</Badge>}
          {isEmittingStatus && (
            <Badge variant="secondary">Emissao em curso</Badge>
          )}
          {status === 'falha_emissao' && (
            <Badge variant="destructive">Falha emissao</Badge>
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
            Confianca: {confianca}
          </Badge>
        )}
      </div>

      <EditableField
        label="Cliente"
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
            <p className="mt-1 text-xs text-destructive">
              NIF invalido (checksum nao bate)
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

      <Separator />

      <ItemsEditor items={items} disabled={isReadOnly} onChange={saveItems} />

      <Separator />

      <div className="grid grid-cols-3 overflow-hidden rounded-lg border bg-muted/25 text-sm">
        <TotalBox label="Subtotal" value={computed.subtotal} />
        <TotalBox label="IVA" value={computed.ivaValor} />
        <TotalBox label="Total" value={computed.total} strong />
      </div>

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
        label="Observacoes"
        value={initial.observacoes}
        onSave={saveField('observacoes')}
      />

      {notasIA && (
        <div className="rounded-lg border border-primary/10 bg-primary/5 p-3">
          <div className="mb-1 text-xs font-medium">Notas da IA</div>
          <div className="text-sm text-muted-foreground">{notasIA}</div>
        </div>
      )}

      {(moloni.documentId || moloni.error) && (
        <div className="space-y-1 rounded-lg border bg-muted/35 p-3 text-sm">
          {moloni.documentId && (
            <div>
              Documento Moloni: <strong>#{moloni.documentId}</strong>
              {moloni.emittedAt && (
                <span className="ml-2 text-muted-foreground">
                  {new Date(moloni.emittedAt).toLocaleString('pt-PT')}
                </span>
              )}
            </div>
          )}
          {isMoloniDraft && (
            <div className="text-muted-foreground">
              Este rascunho ja foi criado no Moloni. Edita ou finaliza no
              Moloni para evitar documentos duplicados.
            </div>
          )}
          {moloni.error && (
            <div className="text-destructive">Erro: {moloni.error}</div>
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

          {!isMoloniDraft && (
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
                <Send className="size-4" />
                Emitir final
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
  return (
    <div className="border-r p-3 last:border-r-0 last:bg-background">
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <div className={strong ? 'text-base font-semibold' : 'font-medium'}>
        {value.toFixed(2)} EUR
      </div>
    </div>
  );
}
