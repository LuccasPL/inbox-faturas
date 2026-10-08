-- Aplicar e autorizar cada endereco revisto antes de publicar o codigo.
-- Enderecos existentes NAO sao aprovados automaticamente.
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "email_inbound_authorized_address" text,
  ADD COLUMN IF NOT EXISTS "email_inbound_authorized_at" timestamp with time zone;
