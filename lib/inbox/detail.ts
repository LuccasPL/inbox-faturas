import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emails, faturasDraft } from '@/lib/db/schema';

export interface AttachmentMetadata { Name?: string; ContentType?: string; ContentLength?: number }

export async function loadOwnedEmailDetail(emailId: string, tenantId: string) {
  const [result] = await db.select({
    email: {
      id: emails.id, fromEmail: emails.fromEmail, toEmail: emails.toEmail, subject: emails.subject,
      bodyText: emails.bodyText, status: emails.status, isFaturaRequest: emails.isFaturaRequest,
      triagemMotivo: emails.triagemMotivo, triagemConfianca: emails.triagemConfianca, createdAt: emails.createdAt,
      attachments: sql<AttachmentMetadata[]>`coalesce((select jsonb_agg(jsonb_build_object(
        'Name', attachment->'Name', 'ContentType', attachment->'ContentType', 'ContentLength', attachment->'ContentLength'))
        from jsonb_array_elements(case when jsonb_typeof(${emails.attachments}) = 'array'
          then ${emails.attachments} else '[]'::jsonb end) attachment), '[]'::jsonb)`,
    },
    draft: faturasDraft,
    shareReferenceTime: sql<string>`clock_timestamp()::text`,
  }).from(emails).leftJoin(faturasDraft, and(eq(faturasDraft.emailId, emails.id), eq(faturasDraft.tenantId, tenantId)))
    .where(and(eq(emails.id, emailId), eq(emails.tenantId, tenantId)))
    .orderBy(sql`${faturasDraft.createdAt} desc nulls last`, desc(faturasDraft.id)).limit(1);
  return result ?? null;
}
