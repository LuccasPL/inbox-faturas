import { pgTable, uuid, text, jsonb, timestamp, numeric } from 'drizzle-orm/pg-core';

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
  // Novos campos da triagem
  isFaturaRequest: text('is_fatura_request'), // 'sim' | 'nao' | 'incerto'
  triagemMotivo: text('triagem_motivo'),
  triagemConfianca: text('triagem_confianca'), // 'alta' | 'media' | 'baixa'
  createdAt: timestamp('created_at').defaultNow(),
});

export const faturasDraft = pgTable('faturas_draft', {
  id: uuid('id').primaryKey().defaultRandom(),
  emailId: uuid('email_id').references(() => emails.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  
  clienteNome: text('cliente_nome'),
  clienteNif: text('cliente_nif'),
  clienteEmail: text('cliente_email'),
  clienteMorada: text('cliente_morada'),
  items: jsonb('items'),
  subtotal: numeric('subtotal', { precision: 10, scale: 2 }),
  ivaPercentagem: numeric('iva_percentagem', { precision: 5, scale: 2 }),
  ivaValor: numeric('iva_valor', { precision: 10, scale: 2 }),
  total: numeric('total', { precision: 10, scale: 2 }),
  iban: text('iban'),
  prazoPagamento: text('prazo_pagamento'),
  observacoes: text('observacoes'),
  
  confiancaExtracao: text('confianca_extracao'),
  rawIaResponse: jsonb('raw_ia_response'),
  status: text('status').default('pendente_revisao'),
  
  createdAt: timestamp('created_at').defaultNow(),
  reviewedAt: timestamp('reviewed_at'),
  reviewedBy: text('reviewed_by'),
  
  dadosFinais: jsonb('dados_finais'),
});