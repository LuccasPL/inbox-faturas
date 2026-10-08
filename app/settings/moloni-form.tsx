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
import { CheckCircle2, LoaderCircle, PlugZap, Save, Unplug } from 'lucide-react';
import { formatFullDate } from '@/lib/format/time';
import {
  saveApiKey,
  saveCompanyAndLoadOptions,
  loadDocumentSetsForType,
  saveDefaults,
  disconnectMoloni,
  verifyMoloniConnection,
  type CompanyOptions,
} from './actions';
import type { UserCompany } from '@/lib/moloni/types';

interface InitialState {
  isConnected: boolean;
  optional: boolean;
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
  const [connected, setConnected] = useState(initial.isConnected);
  const [verification, setVerification] = useState<{ checkedAt: string; error?: string } | null>(null);

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
      setConnected(true);
      setCompanyId(null);
      setOptions(null);
      setVerification(null);
      setDocType(null); setDocSetId(null); setFallbackProductId(null);
      setTaxId23(null); setTaxId13(null); setTaxId6(null); setTaxId0(null);
      setCompanies(res.data ?? []);
      setApiKey('');
    });
  }

  function onPickCompany(id: number) {
    if (id === companyId) return;
    startTransition(async () => {
      const res = await saveCompanyAndLoadOptions(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCompanyId(id);
      setOptions(res.data ?? null);
      setVerification(null);
      setDocType(null); setDocSetId(null); setFallbackProductId(null);
      setTaxId23(null); setTaxId13(null); setTaxId6(null); setTaxId0(null);
      toast.success('Empresa selecionada');
    });
  }

  function onChangeDocType(typeId: number) {
    setVerification(null);
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
    setVerification(null);
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
      setConnected(false);
      setVerification(null);
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

  function onVerify() {
    setVerification(null);
    startTransition(async () => {
      const res = await verifyMoloniConnection();
      if (!res.ok || !res.data) {
        setVerification({ checkedAt: new Date().toISOString(), error: res.error || 'Não foi possível confirmar a ligação.' });
        return;
      }
      setCompanies(res.data.companies);
      setOptions(res.data.options);
      setVerification({ checkedAt: res.data.checkedAt });
    });
  }

  return (
    <Card className="min-w-0 self-start rounded-lg">
      <CardHeader>
        <CardTitle>Moloni ON</CardTitle>
        <CardDescription>
          {initial.optional ? 'Opcional no modo Proforma PDF.' : 'Empresa, série, produto e mapa de IVA para emissão no ERP.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Passo 1 — API Key */}
        {!connected && !companies && (
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
                <PlugZap aria-hidden /> Ligar
              </Button>
            </div>
          </div>
        )}

        {/* Passo 2 — escolher empresa */}
        {connected && (
          <div className="space-y-3 border-b pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm">Chave guardada{companyId ? ` · Empresa ${companyId}` : ''}</span>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={onVerify} disabled={pending}>{pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <PlugZap aria-hidden />}Verificar ligação</Button>
                <Button variant="ghost" size="icon" title="Desligar Moloni" aria-label="Desligar Moloni" onClick={onDisconnect} disabled={pending}><Unplug aria-hidden /></Button>
              </div>
            </div>
            {verification && <div role="status" className={`text-xs leading-relaxed ${verification.error ? 'text-amber-700 dark:text-amber-400' : 'text-primary'}`}>
              <div className="flex items-center gap-1.5 font-medium">{!verification.error && <CheckCircle2 aria-hidden className="size-3.5" />}{verification.error ? 'Verificação não concluída' : 'Ligação verificada'}</div>
              <p className="mt-1">{verification.error || 'Acesso à conta e às opções consultadas; não valida emissão fiscal nem todos os dados guardados.'}</p>
              <time dateTime={verification.checkedAt} className="mt-1 block text-muted-foreground">{formatFullDate(new Date(verification.checkedAt))}</time>
            </div>}
          </div>
        )}

        {companies && (
          <div className="space-y-3">
            <Label htmlFor="moloni-company">Empresa</Label>
            <select id="moloni-company" value={companyId ?? ''} onChange={event => onPickCompany(Number(event.target.value))} disabled={pending} className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm">
              <option value="" disabled>Escolher empresa</option>
              {companies.map((c) => (
                <option
                  key={c.companyId}
                  value={c.companyId}
                >
                  {c.name} · ID {c.companyId}
                </option>
              ))}
            </select>
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
                <Save aria-hidden /> Guardar
              </Button>
            </div>
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
