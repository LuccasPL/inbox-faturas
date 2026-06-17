-- Map of PT VAT rates to Moloni taxId per tenant.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "moloni_tax_id_23" integer,
  ADD COLUMN IF NOT EXISTS "moloni_tax_id_13" integer,
  ADD COLUMN IF NOT EXISTS "moloni_tax_id_6"  integer,
  ADD COLUMN IF NOT EXISTS "moloni_tax_id_0"  integer;
