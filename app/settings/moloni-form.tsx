'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  saveApiKey,
  saveCompanyAndLoadOptions,
  loadDocumentSetsForType,
  saveDefaults,
  disconnectMoloni,
  type CompanyOptions,
} from './actions';
import type { UserCompany } from '@/lib/moloni/types';

interface InitialState {
  isConnected: boolean;
  companyId: number | null;
  defaultDocType: number | null;
  defaultDocSetId: number | null;
  fallbackProductId: number | null;
  taxId23: number | null;
  taxId13: number | null;
  taxId6: number | null;
  taxId0: number | null;
  options: CompanyOptions | null;
  companies: UserCompany[] | null;
}

export function MoloniForm({ initial }: { initial: InitialState }) {
  const [pending, startTransition] = useTransition();

  const [apiKey, setApiKey] = useState('');
  const [companies, setCompanies] = useState<UserCompany[] | null>(
    initial.companies,
  );
  const [companyId, setCompanyId] = useState<number | null>(initial.companyId);
  const [options, setOptions] = useState<CompanyOptions | null>(initial.options);

  const [docType, setDocType] = useState<number | null>(initial.defaultDocType);
  const [docSetId, setDocSetId] = useState<number | null>(
    initial.defaultDocSetId,
  );
  const [fallbackProductId, setFallbackProductId] = useState<number | null>(
    initial.fallbackProductId,
  );
  const [taxId23, setTaxId23] = useState<number | null>(initial.taxId23);
  const [taxId13, setTaxId13] = useState<number | null>(initial.taxId13);
  const [taxId6, setTaxId6] = useState<number | null>(initial.taxId6);
  const [taxId0, setTaxId0] = useState<number | null>(initial.taxId0);

  function onSaveApiKey() {
    startTransition(async () => {
      const res = await saveApiKey(apiKey);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('API key validada');
      setCompanies(res.data ?? []);
      setApiKey('');
    });
  }

  function onPickCompany(id: number) {
    startTransition(async () => {
      const res = await saveCompanyAndLoadOptions(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCompanyId(id);
      setOptions(res.data ?? null);
      toast.success('Empresa selecionada');
    });
  }

  function onChangeDocType(typeId: number) {
    setDocType(typeId);
    startTransition(async () => {
      const res = await loadDocumentSetsForType(typeId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOptions((prev) =>
        prev ? { ...prev, documentSets: res.data ?? [] } : prev,
      );
      setDocSetId(null);
    });
  }

  function onSaveDefaults() {
    if (!docType || !docSetId || !fallbackProductId) {
      toast.error('Preenche tipo de documento, série e produto fallback');
      return;
    }
    if (!taxId23) {
      toast.error('Define pelo menos o tax para IVA 23%');
      return;
    }
    startTransition(async () => {
      const res = await saveDefaults({
        documentTypeId: docType,
        documentSetId: docSetId,
        fallbackProductId,
        taxId23,
        taxId13,
        taxId6,
        taxId0,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Configuração guardada');
    });
  }

  function onDisconnect() {
    if (!confirm('Desligar conta Moloni? A API key será apagada.')) return;
    startTransition(async () => {
      const res = await disconnectMoloni();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Conta desligada');
      setCompanies(null);
      setCompanyId(null);
      setOptions(null);
      setDocType(null);
      setDocSetId(null);
      setFallbackProductId(null);
      setTaxId23(null);
      setTaxId13(null);
      setTaxId6(null);
      setTaxId0(null);
    });
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Moloni ON</CardTitle>
        <CardDescription>
          Liga a conta e escolhe empresa, serie e produto fallback.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Passo 1 — API Key */}
        {!initial.isConnected && !companies && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cola a tua API key Moloni ON. Geras em{' '}
              <a
                href="https://app.molonion.pt"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Conta → API → API Keys
              </a>
              .
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="mol_..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={pending}
              />
              <Button onClick={onSaveApiKey} disabled={pending || !apiKey}>
                Ligar
              </Button>
            </div>
          </div>
        )}

        {/* Passo 2 — escolher empresa */}
        {companies && !companyId && (
          <div className="space-y-3">
            <Label>Escolhe a empresa</Label>
            <div className="space-y-2">
              {companies.map((c) => (
                <button
                  key={c.companyId}
                  onClick={() => onPickCompany(c.companyId)}
                  disabled={pending}
                  className="w-full text-left p-3 border rounded-md hover:bg-accent"
                >
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    ID {c.companyId}
                    {c.isOwner ? ' · Proprietário' : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Passo 3 — defaults */}
        {options && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="docType">Tipo de documento</Label>
              <select
                id="docType"
                value={docType ?? ''}
                onChange={(e) => onChangeDocType(Number(e.target.value))}
                disabled={pending}
                className="w-full h-10 px-3 rounded-md border bg-background"
              >
                <option value="">— escolher —</option>
                {options.documentTypes
                  .filter((t) => t.documentTypeId === 1)
                  .map((t) => (
                    <option key={t.documentTypeId} value={t.documentTypeId}>
                      {t.name} ({t.code})
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="docSet">Série de faturação</Label>
              <select
                id="docSet"
                value={docSetId ?? ''}
                onChange={(e) => setDocSetId(Number(e.target.value))}
                disabled={pending || !options.documentSets.length}
                className="w-full h-10 px-3 rounded-md border bg-background"
              >
                <option value="">— escolher —</option>
                {options.documentSets.map((s) => (
                  <option key={s.documentSetId} value={s.documentSetId}>
                    {s.name}
                    {s.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prod">Produto fallback (linha genérica)</Label>
              <select
                id="prod"
                value={fallbackProductId ?? ''}
                onChange={(e) => setFallbackProductId(Number(e.target.value))}
                disabled={pending}
                className="w-full h-10 px-3 rounded-md border bg-background"
              >
                <option value="">— escolher —</option>
                {options.products.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.name}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Linhas extraídas do email vão usar este produto, com descrição
                e preço sobrepostos.
              </p>
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/25 p-4">
              <div>
                <div className="text-sm font-medium">Mapa de taxas IVA</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Para cada taxa PT, escolhe o tax do Moloni correspondente.
                  Apenas o 23% é obrigatório.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TaxSelect
                  label="IVA 23% (default)"
                  value={taxId23}
                  required
                  taxes={options.taxes}
                  preferRate={23}
                  disabled={pending}
                  onChange={setTaxId23}
                />
                <TaxSelect
                  label="IVA 13%"
                  value={taxId13}
                  taxes={options.taxes}
                  preferRate={13}
                  disabled={pending}
                  onChange={setTaxId13}
                />
                <TaxSelect
                  label="IVA 6%"
                  value={taxId6}
                  taxes={options.taxes}
                  preferRate={6}
                  disabled={pending}
                  onChange={setTaxId6}
                />
                <TaxSelect
                  label="IVA 0% (isento)"
                  value={taxId0}
                  taxes={options.taxes}
                  preferRate={0}
                  disabled={pending}
                  onChange={setTaxId0}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={onSaveDefaults} disabled={pending}>
                Guardar
              </Button>
              <Button
                variant="ghost"
                onClick={onDisconnect}
                disabled={pending}
              >
                Desligar Moloni
              </Button>
            </div>
          </div>
        )}

        {/* Ligado mas sem options carregadas (visita posterior) */}
        {initial.isConnected && !options && !companies && (
          <div className="space-y-3">
            <p className="text-sm">
              Conta ligada. Empresa: <strong>{initial.companyId}</strong>
            </p>
            <Button variant="ghost" onClick={onDisconnect} disabled={pending}>
              Desligar Moloni
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Select de tax do Moloni para uma taxa específica.
 * Ordena por proximidade à taxa preferida (mostra primeiro o match exato).
 */
function TaxSelect({
  label,
  value,
  taxes,
  preferRate,
  disabled,
  required,
  onChange,
}: {
  label: string;
  value: number | null;
  taxes: CompanyOptions['taxes'];
  preferRate: number;
  disabled?: boolean;
  required?: boolean;
  onChange: (v: number | null) => void;
}) {
  const sorted = [...taxes].sort((a, b) => {
    const da = Math.abs(a.value - preferRate);
    const db = Math.abs(b.value - preferRate);
    if (da !== db) return da - db;
    return a.value - b.value;
  });

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`tax-${preferRate}`}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <select
        id={`tax-${preferRate}`}
        value={value ?? ''}
        onChange={(e) =>
          onChange(e.target.value ? Number(e.target.value) : null)
        }
        disabled={disabled}
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
      >
        <option value="">— sem mapeamento —</option>
        {sorted.map((t) => (
          <option key={t.taxId} value={t.taxId}>
            {t.name} ({t.value}%)
            {t.isDefault ? ' · default' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
