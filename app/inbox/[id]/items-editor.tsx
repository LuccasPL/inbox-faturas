'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export interface Item {
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  iva_percentagem: number;
}

interface ItemsEditorProps {
  items: Item[];
  disabled?: boolean;
  onChange: (items: Item[]) => Promise<void>;
}

function lineTotal(item: Item): number {
  return item.quantidade * item.preco_unitario;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

export function ItemsEditor({ items, disabled, onChange }: ItemsEditorProps) {
  const [local, setLocal] = useState<Item[]>(items);
  const [pending, startTransition] = useTransition();

  function commit(next: Item[]) {
    setLocal(next);
    startTransition(async () => {
      try {
        await onChange(next);
      } catch {
        toast.error('Erro ao guardar items');
        setLocal(items); // rollback
      }
    });
  }

  function updateField<K extends keyof Item>(
    index: number,
    field: K,
    value: Item[K],
  ) {
    const next = local.map((it, i) =>
      i === index ? { ...it, [field]: value } : it,
    );
    commit(next);
  }

  function addItem() {
    commit([
      ...local,
      { descricao: '', quantidade: 1, preco_unitario: 0, iva_percentagem: 23 },
    ]);
  }

  function removeItem(index: number) {
    commit(local.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">Items</label>
        {pending && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> A guardar...
          </span>
        )}
      </div>

      {local.length === 0 && (
        <div className="text-sm text-muted-foreground py-2">Sem items</div>
      )}

      <div className="space-y-2">
        {local.map((item, i) => (
          <div
            key={i}
            className="p-3 bg-muted/50 rounded-md space-y-2 border"
          >
            <div className="flex gap-2 items-start">
              <Input
                placeholder="Descrição"
                value={item.descricao}
                onChange={(e) =>
                  setLocal((curr) =>
                    curr.map((it, idx) =>
                      idx === i ? { ...it, descricao: e.target.value } : it,
                    ),
                  )
                }
                onBlur={(e) => updateField(i, 'descricao', e.target.value)}
                disabled={disabled || pending}
                className="flex-1 h-8"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => removeItem(i)}
                disabled={disabled || pending}
                className="h-8 w-8 shrink-0"
                aria-label="Remover linha"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-4 gap-2 text-xs">
              <NumberField
                label="Qtd."
                value={item.quantidade}
                step={1}
                disabled={disabled || pending}
                onCommit={(v) => updateField(i, 'quantidade', v)}
              />
              <NumberField
                label="Preço un. (€)"
                value={item.preco_unitario}
                step={0.01}
                disabled={disabled || pending}
                onCommit={(v) => updateField(i, 'preco_unitario', v)}
              />
              <NumberField
                label="IVA %"
                value={item.iva_percentagem}
                step={1}
                disabled={disabled || pending}
                onCommit={(v) => updateField(i, 'iva_percentagem', v)}
              />
              <div>
                <label className="block mb-1 text-muted-foreground">
                  Total linha
                </label>
                <div className="h-8 flex items-center font-medium">
                  {fmt(lineTotal(item))}€
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={addItem}
        disabled={disabled || pending}
      >
        <Plus className="h-4 w-4 mr-1" /> Adicionar linha
      </Button>
    </div>
  );
}

function NumberField({
  label,
  value,
  step,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  step: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(value.toString());
  const [focused, setFocused] = useState(false);

  // Re-sincroniza com prop externa quando não estiver em edição
  useEffect(() => {
    if (!focused) setDraft(value.toString());
  }, [value, focused]);

  return (
    <div>
      <label className="block mb-1 text-muted-foreground">{label}</label>
      <Input
        type="number"
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          const n = parseFloat(draft);
          onCommit(Number.isFinite(n) ? n : 0);
        }}
        disabled={disabled}
        className="h-8"
      />
    </div>
  );
}
