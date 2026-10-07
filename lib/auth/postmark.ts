import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * Verifica Basic Auth no header Authorization contra credenciais em env.
 *
 * Configurar:
 *   1. POSTMARK_WEBHOOK_USER e POSTMARK_WEBHOOK_PASSWORD no .env.local (e em Vercel)
 *   2. No Postmark: Inbound Stream → Webhook → URL com formato
 *      https://USER:PASS@<dominio>/api/webhooks/postmark
 *      (Postmark codifica USER:PASS no header Authorization: Basic <base64>)
 *
 * Sem credenciais configuradas, o webhook recusa pedidos em qualquer ambiente.
 */
export function verifyPostmarkAuth(req: NextRequest): {
  ok: boolean;
  reason?: string;
} {
  const expectedUser = process.env.POSTMARK_WEBHOOK_USER;
  const expectedPass = process.env.POSTMARK_WEBHOOK_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return { ok: false, reason: 'POSTMARK_WEBHOOK_USER/PASSWORD não configurados' };
  }

  const header = req.headers.get('authorization');
  if (!header || header.length > 4096 || !header.toLowerCase().startsWith('basic ')) {
    return { ok: false, reason: 'sem Authorization Basic' };
  }

  let user: string;
  let pass: string;
  try {
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString(
      'utf8',
    );
    const sep = decoded.indexOf(':');
    if (sep === -1) {
      return { ok: false, reason: 'formato Basic inválido' };
    }
    user = decoded.slice(0, sep);
    pass = decoded.slice(sep + 1);
  } catch {
    return { ok: false, reason: 'base64 inválido' };
  }

  const userMatches = safeEqual(user, expectedUser);
  const passMatches = safeEqual(pass, expectedPass);
  if (!userMatches || !passMatches) {
    return { ok: false, reason: 'credenciais inválidas' };
  }

  return { ok: true };
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = createHash('sha256').update(a).digest();
  const bBuf = createHash('sha256').update(b).digest();
  return timingSafeEqual(aBuf, bBuf);
}
