import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emails, tenants, faturasDraft, emailProcessingJobs as jobs, emailProcessingEvents as events } from '@/lib/db/schema';
import { isInboundAuthorized } from '@/lib/settings/inbound-policy';
import { hasEmailWorkerSecret } from '@/lib/auth/email-worker';
import { buildExtractedDraftValues, type ExtractedDraftData } from '@/lib/drafts/persist-extraction';
import { isProtectedDraft } from './processing';
import { isEmailBusy, MAX_PROCESSING_ATTEMPTS, PROCESSING_LEASE_SECONDS, processingRetrySeconds } from './queue-policy';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type ProcessingMode = 'auto' | 'reprocess' | 'force';
export class EmailQueueError extends Error {}

const clock = sql`statement_timestamp()`;
const emailFields = { id: emails.id, tenantId: emails.tenantId, fromEmail: emails.fromEmail,
  toEmail: emails.toEmail, subject: emails.subject, bodyText: emails.bodyText, attachments: emails.attachments,
  status: emails.status, processingToken: emails.processingToken };

async function record(tx: Transaction, emailId: string, tenantId: string, kind: string, attempt: number, reason: string | null = null) {
  await tx.insert(events).values({ emailId, tenantId, kind, attempt, reason });
}

async function lockedDrafts(tx: Transaction, emailId: string) {
  return tx.select().from(faturasDraft).where(eq(faturasDraft.emailId, emailId)).for('update');
}

function protectedDrafts(drafts: Awaited<ReturnType<typeof lockedDrafts>>, tenantId: string) {
  return drafts.some(draft => draft.tenantId !== tenantId || isProtectedDraft(draft));
}

export async function enqueueInboundEmail(values: typeof emails.$inferInsert & { tenantId: string; providerEventKey: string }) {
  if (!hasEmailWorkerSecret()) throw new EmailQueueError('O processamento de emails requer configuração administrativa.');
  return db.transaction(async tx => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, values.tenantId)).for('share');
    if (!tenant || !isInboundAuthorized(tenant) || tenant.emailInbound !== values.toEmail) {
      throw new EmailQueueError('Destinatário indisponível.');
    }
    const [inserted] = await tx.insert(emails).values({ ...values, status: 'queued' })
      .onConflictDoNothing({ target: emails.providerEventKey }).returning({ id: emails.id });
    const [email] = await tx.select({ id: emails.id, status: emails.status }).from(emails).where(and(
      eq(emails.providerEventKey, values.providerEventKey), eq(emails.tenantId, values.tenantId),
    )).for('update');
    if (!email) throw new EmailQueueError('Receção temporariamente indisponível.');
    if (['queued', 'received', 'processing'].includes(email.status ?? '') &&
      !protectedDrafts(await lockedDrafts(tx, email.id), values.tenantId)) {
      const [job] = await tx.insert(jobs).values({ emailId: email.id, tenantId: values.tenantId })
        .onConflictDoNothing().returning({ emailId: jobs.emailId });
      if (job) await record(tx, email.id, values.tenantId, 'queued', 0);
    }
    return { id: email.id, duplicate: !inserted };
  });
}

export async function enqueueOwnedEmail(emailId: string, tenantId: string, mode: 'reprocess' | 'force', requestedBy: string | null) {
  if (!hasEmailWorkerSecret()) throw new EmailQueueError('O processamento de emails requer configuração administrativa.');
  return db.transaction(async tx => {
    const [email] = await tx.select({ id: emails.id, status: emails.status }).from(emails)
      .where(and(eq(emails.id, emailId), eq(emails.tenantId, tenantId))).for('update');
    if (!email) throw new EmailQueueError('Email indisponível.');
    if (isEmailBusy(email.status)) throw new EmailQueueError('Este email já está em fila ou em processamento.');
    if (protectedDrafts(await lockedDrafts(tx, emailId), tenantId)) {
      throw new EmailQueueError('Documentos aprovados ou emitidos não podem ser reprocessados.');
    }
    await tx.insert(jobs).values({ emailId, tenantId, mode, requestedBy }).onConflictDoUpdate({
      target: jobs.emailId,
      set: { status: 'queued', mode, attempts: 0, availableAt: clock, token: null,
        leaseExpiresAt: null, lastErrorCode: null, requestedBy, updatedAt: clock },
    });
    await tx.update(emails).set({ status: 'queued', processingToken: null, processingStartedAt: null,
      isFaturaRequest: mode === 'force' ? 'sim' : null, triagemMotivo: null, triagemConfianca: null }).where(eq(emails.id, emailId));
    await record(tx, emailId, tenantId, 'queued', 0);
  });
}

export async function claimNextEmailJob(scope?: { emailId: string; tenantId: string }) {
  return db.transaction(async tx => {
    // All mutations lock the email, its drafts and then the job, in that order.
    const [candidate] = await tx.select({ email: emailFields }).from(emails).innerJoin(jobs, and(
      eq(jobs.emailId, emails.id), eq(jobs.tenantId, emails.tenantId),
    )).where(and(
      scope ? and(eq(emails.id, scope.emailId), eq(emails.tenantId, scope.tenantId)) : undefined,
      sql`((${jobs.status} in ('queued', 'retry') and ${jobs.availableAt} <= ${clock})
        or (${jobs.status} = 'running' and ${jobs.leaseExpiresAt} <= ${clock}))`,
      sql`(${emails.status} is distinct from 'processing'
        or coalesce(${emails.processingStartedAt}, ${emails.createdAt}, ${clock} at time zone 'UTC')
          <= (${clock} at time zone 'UTC') - ${PROCESSING_LEASE_SECONDS} * interval '1 second')`,
    )).orderBy(jobs.availableAt, emails.id).limit(1).for('update', { of: emails, skipLocked: true });
    if (!candidate) return null;
    const email = candidate.email;
    const drafts = await lockedDrafts(tx, email.id);
    const [job] = await tx.select().from(jobs).where(and(eq(jobs.emailId, email.id), eq(jobs.tenantId, email.tenantId!))).for('update');
    if (!job) return null;
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, job.tenantId));
    const reason = protectedDrafts(drafts, job.tenantId) ? 'protected'
      : !tenant || !isInboundAuthorized(tenant) || tenant.emailInbound !== email.toEmail ? 'authorization'
        : job.attempts >= MAX_PROCESSING_ATTEMPTS ? 'interrupted' : null;
    if (reason) {
      await tx.update(jobs).set({ status: reason === 'protected' ? 'cancelled' : 'failed', token: null,
        leaseExpiresAt: null, lastErrorCode: reason, updatedAt: clock }).where(eq(jobs.emailId, email.id));
      if (reason !== 'protected') await tx.update(emails).set({ status: 'extraction_failed', processingToken: null, processingStartedAt: null }).where(eq(emails.id, email.id));
      await record(tx, email.id, job.tenantId, reason === 'protected' ? 'cancelled' : 'failed', job.attempts, reason);
      return null;
    }
    const token = randomUUID();
    const [claimed] = await tx.update(jobs).set({ status: 'running', token,
      attempts: job.attempts + 1, leaseExpiresAt: sql`${clock} + ${PROCESSING_LEASE_SECONDS} * interval '1 second'`,
      updatedAt: clock, lastErrorCode: null }).where(eq(jobs.emailId, email.id)).returning();
    await tx.update(emails).set({ status: 'processing', processingToken: token,
      processingStartedAt: sql`${clock} at time zone 'UTC'` }).where(eq(emails.id, email.id));
    await record(tx, email.id, job.tenantId, 'started', claimed.attempts, job.status === 'running' ? 'interrupted' : null);
    return { email, job: claimed, tenant: tenant!, token };
  });
}

export type ClaimedEmailJob = NonNullable<Awaited<ReturnType<typeof claimNextEmailJob>>>;

export async function completeEmailJob(claim: ClaimedEmailJob, result: {
  triagem: { is_fatura_request: string; motivo: string; confianca: string };
  extracted?: { dados: ExtractedDraftData; rawResponse: unknown };
}): Promise<boolean> {
  const values = result.extracted ? buildExtractedDraftValues({ emailId: claim.email.id,
    tenantId: claim.job.tenantId, ...result.extracted }) : null;
  return db.transaction(async tx => {
    const [email] = await tx.select({ id: emails.id }).from(emails).where(and(eq(emails.id, claim.email.id),
      eq(emails.tenantId, claim.job.tenantId), eq(emails.processingToken, claim.token), eq(emails.status, 'processing'))).for('update');
    if (!email) return false;
    const drafts = await lockedDrafts(tx, email.id);
    if (protectedDrafts(drafts, claim.job.tenantId)) return false;
    const [job] = await tx.select().from(jobs).where(and(eq(jobs.emailId, email.id), eq(jobs.tenantId, claim.job.tenantId),
      eq(jobs.token, claim.token), eq(jobs.status, 'running'), sql`${jobs.leaseExpiresAt} > ${clock}`)).for('update');
    if (!job) return false;
    if (values) {
      await tx.delete(faturasDraft).where(and(eq(faturasDraft.emailId, email.id), eq(faturasDraft.tenantId, claim.job.tenantId)));
      await tx.insert(faturasDraft).values(values);
    } else {
      await tx.update(faturasDraft).set({ status: 'rejeitado', reviewedAt: new Date(), reviewedBy: job.requestedBy })
        .where(and(eq(faturasDraft.emailId, email.id), eq(faturasDraft.tenantId, claim.job.tenantId)));
    }
    await tx.update(emails).set({ status: values ? 'extracted' : 'ignored', processingToken: null,
      processingStartedAt: null, isFaturaRequest: result.triagem.is_fatura_request,
      triagemMotivo: result.triagem.motivo, triagemConfianca: result.triagem.confianca }).where(eq(emails.id, email.id));
    await tx.update(jobs).set({ status: 'completed', token: null, leaseExpiresAt: null, lastErrorCode: null, updatedAt: clock }).where(eq(jobs.emailId, email.id));
    await record(tx, email.id, claim.job.tenantId, 'completed', job.attempts);
    return true;
  });
}

export async function failEmailJob(claim: ClaimedEmailJob, reason: string, retryable: boolean, waitSeconds?: number): Promise<boolean> {
  return db.transaction(async tx => {
    const [email] = await tx.select({ id: emails.id }).from(emails).where(and(eq(emails.id, claim.email.id),
      eq(emails.tenantId, claim.job.tenantId), eq(emails.processingToken, claim.token), eq(emails.status, 'processing'))).for('update');
    if (!email) return false;
    const [job] = await tx.select().from(jobs).where(and(eq(jobs.emailId, email.id), eq(jobs.token, claim.token),
      eq(jobs.status, 'running'), sql`${jobs.leaseExpiresAt} > ${clock}`)).for('update');
    if (!job) return false;
    const quota = reason === 'quota';
    const attempts = quota ? Math.max(0, job.attempts - 1) : job.attempts;
    const retry = retryable && attempts < MAX_PROCESSING_ATTEMPTS;
    await tx.update(jobs).set({ status: retry ? 'retry' : 'failed', attempts, token: null, leaseExpiresAt: null,
      lastErrorCode: reason, availableAt: sql`${clock} + ${waitSeconds ?? processingRetrySeconds(attempts)} * interval '1 second'`, updatedAt: clock })
      .where(eq(jobs.emailId, email.id));
    await tx.update(emails).set({ status: retry ? 'retry_wait' : 'extraction_failed', processingToken: null, processingStartedAt: null }).where(eq(emails.id, email.id));
    await record(tx, email.id, job.tenantId, retry ? 'retry' : 'failed', attempts, reason);
    return true;
  });
}
