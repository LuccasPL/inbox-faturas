import 'server-only';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { RateLimitPolicy } from './policies';

interface RateLimitRow extends Record<string, unknown> {
  hits: number;
  retry_after: number;
}

export class ActionRateLimitError extends Error {}

export class RateLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super(`Demasiados pedidos. Tenta novamente dentro de ${retryAfter} segundos.`);
    this.name = 'RateLimitError';
  }
}

export async function enforceRateLimit(subject: string, policy: RateLimitPolicy): Promise<void> {
  const key = createHash('sha256').update(`${policy.name}:${subject}`).digest('hex');
  // The upsert serializes concurrent requests across all server instances.
  const rows = await db.execute<RateLimitRow>(sql`
    insert into security_rate_limits (key, hits, expires_at)
    values (${key}, 1, statement_timestamp() + ${policy.windowSeconds} * interval '1 second')
    on conflict (key) do update set
      hits = case
        when security_rate_limits.expires_at <= statement_timestamp() then 1
        else least(security_rate_limits.hits + 1, ${policy.limit + 1})
      end,
      expires_at = case
        when security_rate_limits.expires_at <= statement_timestamp()
          then statement_timestamp() + ${policy.windowSeconds} * interval '1 second'
        else security_rate_limits.expires_at
      end
    returning hits,
      greatest(1, ceil(extract(epoch from (expires_at - statement_timestamp()))))::int as retry_after
  `);
  const row = rows[0];
  if (!row) throw new Error('Rate limit indisponível');
  if (row.hits > policy.limit) throw new RateLimitError(row.retry_after);
}

export async function actionRateLimitError(subject: string, policy: RateLimitPolicy): Promise<string | null> {
  try {
    await enforceRateLimit(subject, policy);
    return null;
  } catch (error) {
    if (error instanceof RateLimitError) return error.message;
    console.error('[security] rate limit indisponível:', policy.name);
    return 'Proteção de pedidos temporariamente indisponível. Tenta novamente mais tarde.';
  }
}

export async function requireActionRateLimit(subject: string, policy: RateLimitPolicy): Promise<void> {
  const error = await actionRateLimitError(subject, policy);
  if (error) throw new ActionRateLimitError(error);
}

export async function rateLimitResponse(subject: string, policy: RateLimitPolicy): Promise<Response | null> {
  try {
    await enforceRateLimit(subject, policy);
    return null;
  } catch (error) {
    const limited = error instanceof RateLimitError;
    if (!limited) console.error('[security] rate limit indisponível:', policy.name);
    return Response.json(
      { ok: false, error: limited ? error.message : 'Serviço temporariamente indisponível' },
      {
        status: limited ? 429 : 503,
        headers: {
          'Retry-After': String(limited ? error.retryAfter : 30),
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
