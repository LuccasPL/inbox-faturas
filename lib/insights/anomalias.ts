/**
 * Detector de anomalias num draft, comparando com o histórico de
 * pedidos do mesmo cliente. Usa só dados — não chama nada externo.
 */

export type AnomaliaSeverity = 'info' | 'warning' | 'alert';

export interface Anomalia {
  /** Identificador estável para chaves React. */
  key: string;
  severity: AnomaliaSeverity;
  title: string;
  description: string;
}

export interface DraftSnapshot {
  clienteNif: string | null;
  clienteEmail: string | null;
  iban: string | null;
  total: number | null;
  items: Array<{ descricao: string }> | null;
}

export interface HistoricoSnapshot {
  clienteNif: string | null;
  clienteEmail: string | null;
  iban: string | null;
  total: number | null;
  items: Array<{ descricao: string }> | null;
}

/**
 * Aplica heurísticas e devolve anomalias detetadas.
 * - Cliente novo de alto valor (sem histórico, total > 1000€)
 * - Total muito alto vs média (> 3x)
 * - Total muito baixo vs média (< 1/3)
 * - NIF diferente do mais frequente do cliente
 * - IBAN diferente do mais frequente
 * - Email cliente diferente do mais frequente
 * - Items todos diferentes (zero overlap com histórico)
 */
export function detectarAnomalias(
  draft: DraftSnapshot,
  historico: HistoricoSnapshot[],
): Anomalia[] {
  const out: Anomalia[] = [];
  const draftTotal = draft.total ?? null;

  // Cliente novo de alto valor
  if (historico.length === 0) {
    if (draftTotal !== null && draftTotal > 1000) {
      out.push({
        key: 'cliente-novo-alto',
        severity: 'warning',
        title: 'Cliente novo, valor elevado',
        description: `Primeiro pedido deste cliente com total ${fmtEur(draftTotal)}. Confirma os dados antes de emitir.`,
      });
    }
    return out;
  }

  // Médias e modos
  const totais = historico
    .map((h) => h.total)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  if (totais.length >= 1 && draftTotal !== null) {
    const media = totais.reduce((s, v) => s + v, 0) / totais.length;
    if (media > 0) {
      if (draftTotal > media * 3) {
        out.push({
          key: 'total-alto',
          severity: 'alert',
          title: 'Total acima do padrão',
          description: `${fmtEur(draftTotal)} é mais de 3× a média (${fmtEur(media)}) das últimas faturas deste cliente.`,
        });
      } else if (draftTotal < media / 3 && draftTotal > 0) {
        out.push({
          key: 'total-baixo',
          severity: 'info',
          title: 'Total abaixo do padrão',
          description: `${fmtEur(draftTotal)} é menos de 1/3 da média (${fmtEur(media)}) das últimas faturas deste cliente.`,
        });
      }
    }
  }

  // NIF
  const nifMode = mostFrequent(
    historico.map((h) => h.clienteNif).filter(nonEmpty),
  );
  if (draft.clienteNif && nifMode && draft.clienteNif.trim() !== nifMode) {
    out.push({
      key: 'nif-mudou',
      severity: 'alert',
      title: 'NIF diferente do habitual',
      description: `Antes era ${nifMode}, agora ${draft.clienteNif.trim()}. Verifica se é o mesmo cliente.`,
    });
  }

  // IBAN
  const draftIban = draft.iban?.replace(/\s+/g, '');
  const ibanMode = mostFrequent(
    historico
      .map((h) => h.iban?.replace(/\s+/g, ''))
      .filter(nonEmpty),
  );
  if (draftIban && ibanMode && draftIban !== ibanMode) {
    out.push({
      key: 'iban-mudou',
      severity: 'warning',
      title: 'IBAN diferente do habitual',
      description: 'O IBAN deste pedido não bate com o mais usado anteriormente. Confirma antes de pagar.',
    });
  }

  // Email
  const emailMode = mostFrequent(
    historico
      .map((h) => h.clienteEmail?.toLowerCase())
      .filter(nonEmpty),
  );
  if (
    draft.clienteEmail &&
    emailMode &&
    draft.clienteEmail.toLowerCase() !== emailMode
  ) {
    out.push({
      key: 'email-mudou',
      severity: 'info',
      title: 'Email do cliente mudou',
      description: `Antes era ${emailMode}, agora ${draft.clienteEmail}.`,
    });
  }

  // Items completamente novos (sem overlap com histórico)
  const draftDescs = new Set(
    (draft.items ?? [])
      .map((i) => normalizeDescription(i.descricao))
      .filter((d) => d.length > 3),
  );
  if (draftDescs.size > 0) {
    const historicoDescs = new Set(
      historico.flatMap((h) =>
        (h.items ?? []).map((i) => normalizeDescription(i.descricao)),
      ),
    );
    let overlap = 0;
    for (const d of draftDescs) {
      if (historicoDescs.has(d)) overlap++;
    }
    if (overlap === 0 && historicoDescs.size > 0) {
      out.push({
        key: 'items-novos',
        severity: 'info',
        title: 'Tipo de serviço novo',
        description:
          'Nenhuma das linhas deste pedido corresponde a serviços anteriores deste cliente.',
      });
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */

function nonEmpty(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function mostFrequent(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  }
  return best;
}

function normalizeDescription(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n);
}
