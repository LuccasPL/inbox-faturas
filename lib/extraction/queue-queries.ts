import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emailProcessingJobs as jobs, emailProcessingEvents as events } from '@/lib/db/schema';

export async function loadProcessingDetails(emailId: string, tenantId: string) {
  const [jobRows, history] = await Promise.all([
    db.select({ status: jobs.status, attempts: jobs.attempts, availableAt: jobs.availableAt, reason: jobs.lastErrorCode })
      .from(jobs).where(and(eq(jobs.emailId, emailId), eq(jobs.tenantId, tenantId))).limit(1),
    db.select({ id: events.id, kind: events.kind, attempt: events.attempt, reason: events.reason, at: events.createdAt })
      .from(events).where(and(eq(events.emailId, emailId), eq(events.tenantId, tenantId)))
      .orderBy(desc(events.createdAt), desc(events.id)).limit(20),
  ]);
  return { job: jobRows[0] ?? null, events: history.reverse() };
}
