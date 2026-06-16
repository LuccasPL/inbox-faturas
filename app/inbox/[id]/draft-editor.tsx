'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Check, X, Loader2 } from 'lucide-react';
import {
  atualizarDraft,
  aprovarDraft,
  rejeitarDraft,
  emitirFatura,
} from './actions';

interface Item {
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  iva_percentagem: number;
}

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
  };
}

function EditableField({
  label,
  value,
  onSave,
  placeholder = '—',
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
      } catch (error) {
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
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
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
            className="h-8"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={handleCancel}
            disabled={isPending}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div
          onClick={() => setIsEditing(true)}
          className="font-medium cursor-text hover:bg-muted/50 rounded px-2 py-1 -mx-2 min-h-8"
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

  const confiancaVariant = (c: string | null) => {
    if (c === 'alta') return 'default';
    if (c === 'media') return 'secondary';
    return 'destructive';
  };

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
      } catch (error) {
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
      } catch (error) {
        toast.error('Erro ao rejeitar');
      }
    });
  };

  const handleEmitir = (finalize: boolean) => {
    const msg = finalize
      ? 'Emitir fatura FINAL no Moloni? Vai ser numerada e comunicada à AT.'
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
          ? `Fatura emitida (nº ${res.documentNumber})`
          : `Rascunho criado no Moloni (#${res.documentId})`,
      );
      router.refresh();
    });
  };

  const isReadOnly =
    status === 'aprovado' ||
    status === 'rejeitado' ||
    status === 'emitida';
  const isMoloniDraft = status === 'rascunho_moloni';
  const isEmitted = status === 'emitida';
  const anyPending = isApproving || isRejecting || isEmitting;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {status === 'aprovado' && <Badge>Aprovado</Badge>}
          {status === 'rejeitado' && <Badge variant="destructive">Rejeitado</Badge>}
          {status === 'pendente_revisao' && (
            <Badge variant="outline">Pendente revisão</Badge>
          )}
          {isMoloniDraft && (
            <Badge variant="secondary">Rascunho Moloni</Badge>
          )}
          {isEmitted && <Badge>Emitida</Badge>}
          {status === 'falha_emissao' && (
            <Badge variant="destructive">Falha emissão</Badge>
          )}
        </div>
        {confianca && (
          <Badge variant={confiancaVariant(confianca)}>
            Confiança: {confianca}
          </Badge>
        )}
      </div>

      <EditableField
        label="Cliente"
        value={initial.clienteNome}
        onSave={saveField('clienteNome')}
      />

      <div className="grid grid-cols-2 gap-4">
        <EditableField
          label="NIF"
          value={initial.clienteNif}
          onSave={saveField('clienteNif')}
        />
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

      <div>
        <label className="text-xs text-muted-foreground block mb-2">Items</label>
        {initial.items.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sem items</div>
        ) : (
          <div className="space-y-2">
            {initial.items.map((item, i) => (
              <div key={i} className="p-3 bg-muted rounded-md text-sm">
                <div className="font-medium">{item.descricao}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {item.quantidade} × {item.preco_unitario}€ (IVA{' '}
                  {item.iva_percentagem}%)
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2 italic">
          Edição de items virá na próxima versão
        </p>
      </div>

      <Separator />

      <div className="grid grid-cols-3 gap-4">
        <EditableField
          label="Subtotal (€)"
          value={initial.subtotal}
          onSave={saveField('subtotal')}
          type="number"
        />
        <EditableField
          label="IVA (€)"
          value={initial.ivaValor}
          onSave={saveField('ivaValor')}
          type="number"
        />
        <EditableField
          label="Total (€)"
          value={initial.total}
          onSave={saveField('total')}
          type="number"
        />
      </div>

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

      {notasIA && (
        <div className="p-3 bg-primary/5 border border-primary/10 rounded-md">
          <div className="text-xs font-medium mb-1">Notas da IA</div>
          <div className="text-sm text-muted-foreground">{notasIA}</div>
        </div>
      )}

      {(moloni.documentId || moloni.error) && (
        <div className="p-3 rounded-md border bg-muted/40 space-y-1 text-sm">
          {moloni.documentId && (
            <div>
              Documento Moloni: <strong>#{moloni.documentId}</strong>
              {moloni.emittedAt && (
                <span className="text-muted-foreground ml-2">
                  · {new Date(moloni.emittedAt).toLocaleString('pt-PT')}
                </span>
              )}
            </div>
          )}
          {moloni.error && (
            <div className="text-destructive">Erro: {moloni.error}</div>
          )}
        </div>
      )}

      {!isReadOnly && (
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={handleAprovar} disabled={anyPending}>
            {isApproving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                A aprovar...
              </>
            ) : (
              'Aprovar (sem emitir)'
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  A emitir...
                </>
              ) : (
                'Emitir rascunho no Moloni'
              )}
            </Button>
          )}

          <Button
            variant="default"
            onClick={() => handleEmitir(true)}
            disabled={anyPending}
          >
            {isEmitting ? 'A emitir...' : 'Emitir fatura final'}
          </Button>

          <Button
            variant="outline"
            onClick={handleRejeitar}
            disabled={anyPending}
          >
            {isRejecting ? 'A rejeitar...' : 'Rejeitar'}
          </Button>
        </div>
      )}
    </div>
  );
}