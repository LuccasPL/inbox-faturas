import { timingSafeEqual } from 'node:crypto';
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
 * Em dev (sem credenciais configuradas), a verificação passa — mas no log
 * fica um aviso. Em produção, sem credenciais o webhook recusa tudo.
 */
export function verifyPostmarkAuth(req: NextRequest): {
  ok: boolean;
  reason?: string;
} {
  const expectedUser = process.env.POSTMARK_WEBHOOK_USER;
  const expectedPass = process.env.POSTMARK_WEBHOOK_PASSWORD;

  if (!expectedUser || !expectedPass) {
    if (process.env.NODE_ENV === 'production') {
      return {
        ok: false,
        reason: 'POSTMARK_WEBHOOK_USER/PASSWORD não configurados em produção',
      };
    }
    // dev/local: passa, mas avisa
    console.warn(
      '[postmark] credenciais não configuradas — webhook desprotegido em dev',
    );
    return { ok: true };
  }

  const header = req.headers.get('authorization');
  if (!header || !header.toLowerCase().startsWith('basic ')) {
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

  // Constant-time comparison para evitar timing attacks.
  // Pad ao comprimento maior para garantir buffers iguais.
  if (!safeEqual(user, expectedUser) || !safeEqual(pass, expectedPass)) {
    return { ok: false, reason: 'credenciais inválidas' };
  }

  return { ok: true };
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    // timing-safe sobre um buffer dummy do mesmo tamanho, ainda assim falsa
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}
