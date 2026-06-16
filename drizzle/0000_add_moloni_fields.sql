-- Baseline + Moloni fields.
-- Works both for a fresh database and for the existing pre-migrations DB.

CREATE TABLE IF NOT EXISTS "tenants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "nome" text NOT NULL,
  "email_inbound" text UNIQUE NOT NULL,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "emails" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "from_email" text NOT NULL,
  "to_email" text NOT NULL,
  "subject" text,
  "body_text" text,
  "body_html" text,
  "raw_payload" jsonb NOT NULL,
  "attachments" jsonb,
  "status" text DEFAULT 'pending',
  "is_fatura_request" text,
  "triagem_motivo" text,
  "triagem_confianca" text,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "faturas_draft" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email_id" uuid REFERENCES "emails"("id") ON DELETE CASCADE,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "cliente_nome" text,
  "cliente_nif" text,
  "cliente_email" text,
  "cliente_morada" text,
  "items" jsonb,
  "subtotal" numeric(10, 2),
  "iva_percentagem" numeric(5, 2),
  "iva_valor" numeric(10, 2),
  "total" numeric(10, 2),
  "iban" text,
  "prazo_pagamento" text,
  "observacoes" text,
  "confianca_extracao" text,
  "raw_ia_response" jsonb,
  "status" text DEFAULT 'pendente_revisao',
  "created_at" timestamp DEFAULT now(),
  "reviewed_at" timestamp,
  "reviewed_by" text,
  "dados_finais" jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_emails_is_fatura"
  ON "emails" ("is_fatura_request");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_faturas_draft_email"
  ON "faturas_draft" ("email_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_faturas_draft_status"
  ON "faturas_draft" ("status");
--> statement-breakpoint
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "moloni_api_key_enc" text,
  ADD COLUMN IF NOT EXISTS "moloni_company_id" integer,
  ADD COLUMN IF NOT EXISTS "moloni_default_doc_set_id" integer,
  ADD COLUMN IF NOT EXISTS "moloni_default_doc_type" integer,
  ADD COLUMN IF NOT EXISTS "moloni_fallback_product_id" integer;
--> statement-breakpoint
ALTER TABLE "faturas_draft"
  ADD COLUMN IF NOT EXISTS "moloni_document_id" integer,
  ADD COLUMN IF NOT EXISTS "moloni_pdf_url" text,
  ADD COLUMN IF NOT EXISTS "emitted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "emit_error" text;
