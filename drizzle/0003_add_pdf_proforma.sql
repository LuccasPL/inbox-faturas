-- Proforma PDF como alternativa ao Moloni.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "emissao_via"    text DEFAULT 'moloni',
  ADD COLUMN IF NOT EXISTS "empresa_nif"    text,
  ADD COLUMN IF NOT EXISTS "empresa_morada" text,
  ADD COLUMN IF NOT EXISTS "empresa_iban"   text;
--> statement-breakpoint
ALTER TABLE "faturas_draft"
  ADD COLUMN IF NOT EXISTS "emitted_via"     text,
  ADD COLUMN IF NOT EXISTS "proforma_numero" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_faturas_draft_proforma_per_tenant"
  ON "faturas_draft" ("tenant_id", "proforma_numero");
