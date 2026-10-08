import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emails } from '@/lib/db/schema';
import { INBOX_PRIORITIES, type PriorityCount } from '@/lib/inbox/priorities';
import { inboxPriorityExpression, latestOwnedInboxDraft } from '@/lib/inbox/query-base';

export async function loadDashboardPriorities(tenantId: string): Promise<PriorityCount[]> {
  const draft = latestOwnedInboxDraft(tenantId);
  const classified = db.select({ kind: inboxPriorityExpression(draft).as('priority_kind') })
    .from(emails).leftJoin(draft, eq(draft.emailId, emails.id)).where(eq(emails.tenantId, tenantId)).as('priority_emails');
  const fields = Object.fromEntries(INBOX_PRIORITIES.map(priority => [priority.id,
    sql<number>`count(*) filter (where ${classified.kind} = ${priority.id})`.mapWith(Number)]));
  const [totals] = await db.select(fields).from(classified);
  return INBOX_PRIORITIES.map(priority => ({ ...priority, count: totals[priority.id] ?? 0 }));
}
