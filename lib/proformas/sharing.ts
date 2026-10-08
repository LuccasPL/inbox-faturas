import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { faturasDraft, tenants } from '@/lib/db/schema';
import { DraftValidationError } from '@/lib/validation/draft';
import { parseShareOptions, SHARE_TOKEN_RE, shareState } from './share-policy';

export async function changeProformaShare(draftId: string, tenantId: string, operation: 'get' | 'revoke', input: unknown) {
  const options = parseShareOptions(input);
  return db.transaction(async tx => {
    const [draft] = await tx.select({ id: faturasDraft.id, emailId: faturasDraft.emailId,
      status: faturasDraft.status, numero: faturasDraft.proformaNumero,
      token: faturasDraft.proformaShareToken, expiresAt: faturasDraft.proformaShareExpiresAt })
      .from(faturasDraft).where(and(eq(faturasDraft.id, draftId), eq(faturasDraft.tenantId, tenantId))).for('update');
    if (!draft || draft.status !== 'emitida_proforma' || !draft.numero) {
      throw new DraftValidationError('Só é possível partilhar uma proforma emitida da sua empresa.');
    }
    if ('expectedToken' in options && options.expectedToken !== draft.token) {
      throw new DraftValidationError('A partilha mudou noutro separador. Atualize a página antes de continuar.');
    }
    const [{ now }] = await tx.select({ now: sql<string>`clock_timestamp()::text` })
      .from(faturasDraft).where(eq(faturasDraft.id, draftId));
    const time = Date.parse(now);
    if (!Number.isFinite(time)) throw new Error('Invalid database clock');
    if (operation === 'get' && !options.regenerate && shareState(!!draft.token, draft.expiresAt, time) === 'active') {
      return { emailId: draft.emailId, token: draft.token, expiresAt: draft.expiresAt };
    }
    const token = operation === 'revoke' ? null : randomBytes(24).toString('base64url');
    const expiresAt = token ? new Date(time + options.days! * 86_400_000) : null;
    await tx.update(faturasDraft).set({ proformaShareToken: token, proformaShareExpiresAt: expiresAt,
      proformaShareOpenedAt: null }).where(and(eq(faturasDraft.id, draftId), eq(faturasDraft.tenantId, tenantId)));
    return { emailId: draft.emailId, token, expiresAt };
  });
}

export function activeShareCondition(token: string) {
  return and(eq(faturasDraft.proformaShareToken, token), eq(faturasDraft.status, 'emitida_proforma'),
    sql`${faturasDraft.proformaNumero} > 0`, sql`${faturasDraft.proformaShareExpiresAt} > clock_timestamp()`);
}

export async function getPublicProforma(token: string) {
  if (!SHARE_TOKEN_RE.test(token)) return null;
  const [row] = await db.select({
    draft: { id: faturasDraft.id, items: faturasDraft.items, dadosFinais: faturasDraft.dadosFinais,
      proformaNumero: faturasDraft.proformaNumero, emittedAt: faturasDraft.emittedAt, createdAt: faturasDraft.createdAt,
      clienteNome: faturasDraft.clienteNome, clienteNif: faturasDraft.clienteNif, clienteEmail: faturasDraft.clienteEmail,
      clienteMorada: faturasDraft.clienteMorada, observacoes: faturasDraft.observacoes, prazoPagamento: faturasDraft.prazoPagamento,
      proformaShareOpenedAt: faturasDraft.proformaShareOpenedAt },
    tenant: { id: tenants.id, nome: tenants.nome, empresaNif: tenants.empresaNif, empresaMorada: tenants.empresaMorada,
      empresaIban: tenants.empresaIban, emailInbound: tenants.emailInbound },
  }).from(faturasDraft).innerJoin(tenants, eq(tenants.id, faturasDraft.tenantId)).where(activeShareCondition(token)).limit(1);
  return row ?? null;
}

export async function recordShareOpening(draftId: string, token: string) {
  await db.update(faturasDraft).set({ proformaShareOpenedAt: new Date() })
    .where(and(eq(faturasDraft.id, draftId), activeShareCondition(token), isNull(faturasDraft.proformaShareOpenedAt)));
}
