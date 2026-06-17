-- Tracking do envio da proforma ao cliente.

ALTER TABLE "faturas_draft"
  ADD COLUMN IF NOT EXISTS "proforma_sent_at" timestamp,
  ADD COLUMN IF NOT EXISTS "proforma_sent_to" text;
