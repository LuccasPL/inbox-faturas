import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  emailInbound: text('email_inbound').unique().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const emails = pgTable('emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  fromEmail: text('from_email').notNull(),
  toEmail: text('to_email').notNull(),
  subject: text('subject'),
  bodyText: text('body_text'),
  bodyHtml: text('body_html'),
  rawPayload: jsonb('raw_payload').notNull(),
  attachments: jsonb('attachments'),
  status: text('status').default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
});