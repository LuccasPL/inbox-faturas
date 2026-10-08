import 'server-only';
import { claimNextEmailJob, completeEmailJob, failEmailJob, type ClaimedEmailJob } from './queue';
import { triarEmail } from './triagem-email';
import { extrairDadosFatura } from './extract-fatura';
import { extractPdfAttachments } from './attachments';
import { buscarHistoricoCliente } from './historico-cliente';
import { TriagemValidationError } from '@/lib/validation/triagem';
import { DraftValidationError } from '@/lib/validation/draft';
import { RATE_LIMITS } from '@/lib/security/policies';
import { enforceRateLimit, RateLimitError } from '@/lib/security/rate-limit';
import { notifyRelevantInboundEmail } from '@/lib/email/relevant-request-notification';

export function processingFailure(error: unknown) {
  if (error instanceof TriagemValidationError || error instanceof DraftValidationError) {
    return { reason: 'invalid_response', retryable: false };
  }
  const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return { reason: 'configuration', retryable: false };
  }
  return { reason: 'temporary', retryable: true };
}

async function processClaim(claim: ClaimedEmailJob) {
  try {
    await enforceRateLimit(claim.job.tenantId, RATE_LIMITS.ai);
  } catch (error) {
    await failEmailJob(claim, 'quota', true, error instanceof RateLimitError ? error.retryAfter : 60);
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    await failEmailJob(claim, 'configuration', false);
    return;
  }
  try {
    const { email, tenant, job } = claim;
    const triagem = job.mode === 'force'
      ? { is_fatura_request: 'sim', motivo: 'Reclassificado manualmente pelo utilizador', confianca: 'alta' }
      : await triarEmail(email.subject ?? '', email.bodyText ?? '', email.fromEmail);
    const extracted = triagem.is_fatura_request === 'nao' ? undefined : await extrairDadosFatura(
      email.subject ?? '', email.bodyText ?? '', email.fromEmail, extractPdfAttachments(email.attachments),
      await buscarHistoricoCliente({ tenantId: job.tenantId, fromEmail: email.fromEmail }),
    );
    const completed = await completeEmailJob(claim, { triagem, extracted });
    // Notifications are not retried automatically: an uncertain send can duplicate mail.
    if (completed && extracted && job.mode === 'auto') {
      await notifyRelevantInboundEmail({ tenant, email: { id: email.id, fromEmail: email.fromEmail, subject: email.subject },
        triagem: { isFaturaRequest: triagem.is_fatura_request, confianca: triagem.confianca, motivo: triagem.motivo },
        draft: { clienteNome: extracted.dados.cliente_nome, total: extracted.dados.total?.toString() ?? null,
          confiancaExtracao: extracted.dados.confianca_extracao } }).catch(() => console.warn('[email-worker] Alerta não confirmado.'));
    }
  } catch (error) {
    const failure = processingFailure(error);
    await failEmailJob(claim, failure.reason, failure.retryable);
    console.warn('[email-worker] Tentativa não concluída:', failure.reason);
  }
}

export async function runEmailQueue(scope?: { emailId: string; tenantId: string }) {
  const claim = await claimNextEmailJob(scope);
  if (!claim) return false;
  await processClaim(claim);
  return true;
}
