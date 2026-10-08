'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { Clock3, Copy, Link, Loader2, RotateCw, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatShareDate, SHARE_DURATIONS, shareState, type ShareDuration } from '@/lib/proformas/share-policy';

type Result = { ok: boolean; error?: string; url?: string; expiresAt?: string };

interface ProformaSharingProps {
  hasLink: boolean;
  expiresAt: string | null;
  openedAt: string | null;
  referenceTime: number;
  onGenerate: (regenerate: boolean, days: ShareDuration) => Promise<Result>;
  onRevoke: () => Promise<Result>;
  onChanged: () => void;
}

export function ProformaSharing({ hasLink, expiresAt, openedAt, referenceTime, onGenerate, onRevoke, onChanged }: ProformaSharingProps) {
  const id = useId();
  const [days, setDays] = useState<ShareDuration>(7);
  const [now, setNow] = useState(referenceTime);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fallbackUrl, setFallbackUrl] = useState('');
  const [pending, startTransition] = useTransition();
  const state = shareState(hasLink, expiresAt, now);

  useEffect(() => {
    if (!hasLink || !expiresAt) return;
    const remaining = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(remaining)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.max(remaining, 0), 2_147_483_647));
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [hasLink, expiresAt]);

  function generate(regenerate = false) {
    if (regenerate && !confirm('Renovar o link? O link anterior deixará de funcionar.')) return;
    setError(''); setMessage(''); setFallbackUrl('');
    startTransition(async () => {
      try {
        const result = await onGenerate(regenerate, days);
        if (!result.ok || !result.url) { setError(result.error ?? 'Não foi possível gerar o link.'); return; }
        try {
          await navigator.clipboard.writeText(result.url);
          setMessage('Link copiado.');
        } catch {
          setFallbackUrl(result.url);
          setMessage('Link disponível para copiar.');
        }
        onChanged();
      } catch { setError('Não foi possível concluir a partilha. Tente novamente.'); }
    });
  }

  function revoke() {
    if (!confirm('Revogar o acesso público a esta proforma? O download na sua conta continua disponível.')) return;
    setError(''); setMessage(''); setFallbackUrl('');
    startTransition(async () => {
      try {
        const result = await onRevoke();
        if (!result.ok) { setError(result.error ?? 'Não foi possível revogar o link.'); return; }
        setMessage('Acesso público revogado.');
        onChanged();
      } catch { setError('Não foi possível revogar o link. Tente novamente.'); }
    });
  }

  return (
    <section aria-label="Partilha pública da proforma" className="mt-4 space-y-3 border-t pt-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium"><Link aria-hidden className="size-3.5" />Partilha pública</span>
        <span className={state === 'expired' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}>
          {state === 'active' ? 'Link ativo' : state === 'expired' ? 'Link expirado' : 'Sem link ativo'}
        </span>
      </div>
      {state !== 'inactive' && expiresAt && (
        <p className="flex items-start gap-1.5 text-muted-foreground"><Clock3 aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{state === 'active' ? 'Válido até ' : 'Expirou em '}<time dateTime={expiresAt} title="Hora de Lisboa">{formatShareDate(expiresAt)}</time></span>
        </p>
      )}
      {openedAt && hasLink && <p className="text-muted-foreground">Primeira abertura: <time dateTime={openedAt} title="Hora de Lisboa">{formatShareDate(openedAt)}</time></p>}
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={id} className="grid gap-1.5 text-muted-foreground">Validade do novo link
          <select id={id} value={days} onChange={event => setDays(Number(event.target.value) as ShareDuration)} disabled={pending}
            className="h-8 min-w-28 rounded-md border bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            {SHARE_DURATIONS.map(value => <option key={value} value={value}>{value} {value === 1 ? 'dia' : 'dias'}</option>)}
          </select>
        </label>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => generate()}>
          {pending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : state === 'active' ? <Copy aria-hidden className="size-3.5" /> : <Link aria-hidden className="size-3.5" />}
          {state === 'active' ? 'Copiar link' : 'Gerar link'}
        </Button>
        {state === 'active' && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => generate(true)} title="Cria um novo link e invalida o anterior"><RotateCw aria-hidden className="size-3.5" />Renovar</Button>}
        {hasLink && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={revoke} title="Retira o acesso público à proforma"><Unlink aria-hidden className="size-3.5" />Revogar</Button>}
      </div>
      {fallbackUrl && <label className="grid gap-1.5">Link público<input readOnly value={fallbackUrl} onFocus={event => event.target.select()}
        className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-xs" /></label>}
      <p className="text-muted-foreground">Quem tiver o link pode abrir o documento até ao fim da validade. A revogação não remove PDFs já descarregados.</p>
      {message && <p role="status" className="text-primary">{message}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </section>
  );
}
