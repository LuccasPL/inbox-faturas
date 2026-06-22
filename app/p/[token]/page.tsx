import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import {
  Download,
  FileText,
  Mail,
  MapPin,
  Receipt,
} from 'lucide-react';
import { db } from '@/lib/db';
import { faturasDraft, tenants } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

const eur = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
});

const dt = new Intl.DateTimeFormat('pt-PT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

interface ProformaItem {
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  iva_percentagem: number;
}

export default async function PublicProformaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 16) notFound();

  const [row] = await db
    .select({ draft: faturasDraft, tenant: tenants })
    .from(faturasDraft)
    .innerJoin(tenants, eq(tenants.id, faturasDraft.tenantId))
    .where(eq(faturasDraft.proformaShareToken, token))
    .limit(1);

  if (!row?.draft) notFound();
  const { draft, tenant } = row;
  if (draft.status !== 'emitida_proforma' || !draft.proformaNumero) {
    notFound();
  }

  // Marca a primeira abertura (best-effort, sem await crítico)
  if (!draft.proformaShareOpenedAt) {
    await db
      .update(faturasDraft)
      .set({ proformaShareOpenedAt: new Date() })
      .where(eq(faturasDraft.id, draft.id));
  }

  const items = (draft.items as ProformaItem[] | null) ?? [];
  const subtotal = items.reduce(
    (s, it) => s + (it.quantidade ?? 0) * (it.preco_unitario ?? 0),
    0,
  );
  const ivaValor = items.reduce(
    (s, it) =>
      s +
      (it.quantidade ?? 0) *
        (it.preco_unitario ?? 0) *
        ((it.iva_percentagem ?? 0) / 100),
    0,
  );
  const total = subtotal + ivaValor;

  const numFormatado = String(draft.proformaNumero).padStart(6, '0');

  return (
    <main className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Cabeçalho */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Proforma
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {tenant.nome}
            </h1>
            <p className="text-sm text-muted-foreground">
              N.º <span className="tabular-nums">{numFormatado}</span>
              {draft.emittedAt && (
                <span className="ml-2">· {dt.format(draft.emittedAt)}</span>
              )}
            </p>
          </div>
          <a
            href={`/api/p/${token}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            <Download className="size-4" />
            Descarregar PDF
          </a>
        </header>

        {/* Card principal */}
        <section className="rounded-lg border bg-background">
          <div className="grid gap-6 border-b p-6 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Emitente
              </div>
              <div className="mt-2 text-sm font-medium">{tenant.nome}</div>
              {tenant.empresaNif && (
                <div className="text-xs text-muted-foreground">
                  NIF {tenant.empresaNif}
                </div>
              )}
              {tenant.empresaMorada && (
                <div className="text-xs text-muted-foreground">
                  {tenant.empresaMorada}
                </div>
              )}
              {tenant.emailInbound && (
                <div className="text-xs text-muted-foreground">
                  {tenant.emailInbound}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Cliente
              </div>
              <div className="mt-2 text-sm font-medium">
                {draft.clienteNome ?? '—'}
              </div>
              {draft.clienteNif && (
                <div className="text-xs text-muted-foreground">
                  NIF {draft.clienteNif}
                </div>
              )}
              {draft.clienteMorada && (
                <div className="text-xs text-muted-foreground">
                  {draft.clienteMorada}
                </div>
              )}
              {draft.clienteEmail && (
                <div className="text-xs text-muted-foreground">
                  {draft.clienteEmail}
                </div>
              )}
            </div>
          </div>

          {/* Linhas */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Descrição</th>
                  <th className="px-6 py-3 text-right font-medium">Qtd.</th>
                  <th className="px-6 py-3 text-right font-medium">Preço</th>
                  <th className="px-6 py-3 text-right font-medium">IVA</th>
                  <th className="px-6 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-6 py-3">{it.descricao}</td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {it.quantidade}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {eur.format(it.preco_unitario)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {it.iva_percentagem}%
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {eur.format(
                        (it.quantidade ?? 0) * (it.preco_unitario ?? 0),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totais */}
          <div className="border-t bg-muted/15 p-6">
            <dl className="ml-auto grid max-w-xs gap-2 text-sm">
              <Row label="Subtotal" value={eur.format(subtotal)} />
              <Row label="IVA" value={eur.format(ivaValor)} />
              <div className="my-1 border-t" />
              <Row label="Total" value={eur.format(total)} bold />
            </dl>
          </div>

          {/* Condições */}
          {(draft.prazoPagamento ||
            tenant.empresaIban ||
            draft.observacoes) && (
            <div className="grid gap-3 border-t p-6 text-sm">
              {draft.prazoPagamento && (
                <Meta
                  icon={Receipt}
                  label="Prazo"
                  value={draft.prazoPagamento}
                />
              )}
              {tenant.empresaIban && (
                <Meta
                  icon={Mail}
                  label="IBAN"
                  value={tenant.empresaIban}
                />
              )}
              {draft.observacoes && (
                <Meta
                  icon={MapPin}
                  label="Observações"
                  value={draft.observacoes}
                />
              )}
            </div>
          )}
        </section>

        <footer className="space-y-1 text-center text-xs text-muted-foreground">
          <p className="flex items-center justify-center gap-1.5">
            <FileText className="size-3" />
            Documento proforma — sem valor fiscal. A fatura legal será emitida
            após confirmação.
          </p>
        </footer>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={bold ? 'font-medium' : 'text-muted-foreground'}>
        {label}
      </dt>
      <dd
        className={
          bold
            ? 'text-base font-semibold tabular-nums'
            : 'tabular-nums'
        }
      >
        {value}
      </dd>
    </div>
  );
}

import type { ComponentType } from 'react';

function Meta({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[1.25rem_6rem_1fr] items-baseline gap-3">
      <Icon className="size-4 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
