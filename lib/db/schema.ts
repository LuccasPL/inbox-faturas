import { pgTable, uuid, text, jsonb, timestamp, numeric, integer } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  emailInbound: text('email_inbound').unique().notNull(),
  createdAt: timestamp('created_at').defaultNow(),

  // Mapeamento 1:1 com o utilizador Clerk
  clerkUserId: text('clerk_user_id').unique(),

  // Integração Moloni ON
  // API key guardada encriptada (AES-256-GCM) — ver lib/crypto.ts
  moloniApiKeyEnc: text('moloni_api_key_enc'),
  moloniCompanyId: integer('moloni_company_id'),
  moloniDefaultDocSetId: integer('moloni_default_doc_set_id'),
  moloniDefaultDocType: integer('moloni_default_doc_type'),
  moloniFallbackProductId: integer('moloni_fallback_product_id'),

  // Mapeamento taxa de IVA -> taxId do Moloni (cada empresa Moloni
  // tem os seus próprios IDs para 23%, 13%, 6% e 0%).
  moloniTaxId23: integer('moloni_tax_id_23'),
  moloniTaxId13: integer('moloni_tax_id_13'),
  moloniTaxId6: integer('moloni_tax_id_6'),
  moloniTaxId0: integer('moloni_tax_id_0'),

  // Destino preferido ao "Emitir": 'moloni' (fatura certificada AT) ou
  // 'pdf_proforma' (documento PDF não fiscal gerado pela app).
  emissaoVia: text('emissao_via').default('moloni'),

  // Cabeçalho da empresa emitente para o PDF da proforma.
  // (No Moloni vem da configuração da empresa.)
  empresaNif: text('empresa_nif'),
  empresaMorada: text('empresa_morada'),
  empresaIban: text('empresa_iban'),
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

  // Emissão no Moloni
  moloniDocumentId: integer('moloni_document_id'),
  moloniPdfUrl: text('moloni_pdf_url'),
  emittedAt: timestamp('emitted_at'),
  emitError: text('emit_error'),

  // Para que destino foi emitido: 'moloni' | 'pdf_proforma'
  emittedVia: text('emitted_via'),
  // Nº sequencial da proforma por tenant (preenchido só quando emittedVia='pdf_proforma')
  proformaNumero: integer('proforma_numero'),
});