-- Migration: add_moloni_fields
-- Snapshot baseline + adição de campos Moloni ON.
-- As tabelas tenants/emails/faturas_draft já existem na BD (criadas antes
-- de usarmos migrations). Este ficheiro só adiciona as colunas novas.

ALTER TABLE "tenants"
  ADD COLUMN "moloni_api_key_enc"          text,
  ADD COLUMN "moloni_company_id"           integer,
  ADD COLUMN "moloni_default_doc_set_id"   integer,
  ADD COLUMN "moloni_default_doc_type"     integer,
  ADD COLUMN "moloni_fallback_product_id"  integer;
--> statement-breakpoint
ALTER TABLE "faturas_draft"
  ADD COLUMN "moloni_document_id"  integer,
  ADD COLUMN "moloni_pdf_url"      text,
  ADD COLUMN "emitted_at"          timestamp,
  ADD COLUMN "emit_error"          text;
