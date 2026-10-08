import { verifyEmailWorkerAuth } from '@/lib/auth/email-worker';
import { scheduleEmailProcessing } from '@/lib/extraction/schedule';
import { rateLimitResponse } from '@/lib/security/rate-limit';
import { RATE_LIMITS } from '@/lib/security/policies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  if (!verifyEmailWorkerAuth(request)) return Response.json({ ok: false }, {
    status: 401, headers: { 'Cache-Control': 'no-store' },
  });
  const limited = await rateLimitResponse('email-worker', RATE_LIMITS.emailWorker);
  if (limited) return limited;
  scheduleEmailProcessing();
  return Response.json({ ok: true, scheduled: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = POST;
