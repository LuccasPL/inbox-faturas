import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { verifyPostmarkAuth } from '@/lib/auth/postmark';
import { hasEmailWorkerSecret } from '@/lib/auth/email-worker';
import { normalizeEmailAddress } from '@/lib/email/address';
import { MAX_INBOUND_BYTES, validateInboundPayload, type PostmarkInboundPayload } from '@/lib/email/postmark-inbound';
import { readJsonBody, RequestBodyError } from '@/lib/security/request-body';
import { RATE_LIMITS, TIMEOUTS } from '@/lib/security/policies';
import { rateLimitResponse } from '@/lib/security/rate-limit';
import { findAuthorizedInboundTenant } from '@/lib/settings/company';
import { enqueueInboundEmail, EmailQueueError } from '@/lib/extraction/queue';
import { scheduleEmailProcessing } from '@/lib/extraction/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest): Promise<Response> {
  const auth = verifyPostmarkAuth(req);
  if (!auth.ok) return new NextResponse('Unauthorized', {
    status: 401, headers: { 'WWW-Authenticate': 'Basic realm="postmark-webhook"' },
  });
  try {
    const payload = validateInboundPayload(await readJsonBody(req, MAX_INBOUND_BYTES, TIMEOUTS.requestBody));
    const fromEmail = normalizeEmailAddress(payload.From || '');
    const toEmail = normalizeEmailAddress(payload.OriginalRecipient || payload.To || '');
    const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
    if (!emailPattern.test(toEmail) || !emailPattern.test(fromEmail)) {
      return NextResponse.json({ ok: false, error: 'invalid address' }, { status: 400 });
    }
    const tenant = await findAuthorizedInboundTenant(toEmail);
    if (!tenant) return NextResponse.json({ ok: false, error: 'recipient unavailable' }, {
      status: 503, headers: { 'Retry-After': '60' },
    });
    if (!hasEmailWorkerSecret()) return NextResponse.json({ ok: false, error: 'processing unavailable' }, {
      status: 503, headers: { 'Retry-After': '60' },
    });
    const inboundLimit = await rateLimitResponse(tenant.id, RATE_LIMITS.inbound);
    if (inboundLimit) return inboundLimit;
    const received = await enqueueInboundEmail({
      tenantId: tenant.id, fromEmail, toEmail, subject: payload.Subject || null,
      bodyText: payload.TextBody || null, bodyHtml: payload.HtmlBody || null,
      rawPayload: payload, attachments: payload.Attachments || [],
      providerEventKey: buildProviderEventKey(tenant.id, payload, toEmail),
    });
    scheduleEmailProcessing({ emailId: received.id, tenantId: tenant.id });
    return NextResponse.json({ ok: true, ...received }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error('[postmark] Receção não concluída.');
    return NextResponse.json({ ok: false, error: 'reception unavailable' }, {
      status: error instanceof EmailQueueError ? 503 : 500, headers: { 'Retry-After': '60' },
    });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, message: 'Webhook Postmark ativo' });
}

function buildProviderEventKey(
  tenantId: string,
  payload: PostmarkInboundPayload,
  toEmail: string,
): string {
  const messageId = (payload.MessageID || payload.MessageId || '').trim();
  if (messageId) {
    return `postmark:${tenantId}:${messageId.toLowerCase()}`;
  }

  const fallback = JSON.stringify({
    from: payload.From || '',
    to: toEmail,
    subject: payload.Subject || '',
    textBody: payload.TextBody || '',
    date: payload.Date || '',
    mailboxHash: payload.MailboxHash || '',
    attachments: Array.isArray(payload.Attachments)
      ? payload.Attachments.map((att) => {
          const item = att as {
            Name?: string;
            ContentLength?: number;
            ContentType?: string;
          };
          return [
            item.Name || '',
            item.ContentLength || 0,
            item.ContentType || '',
          ];
        })
      : [],
  });

  return `postmark:${tenantId}:sha256:${createHash('sha256').update(fallback).digest('hex')}`;
}
