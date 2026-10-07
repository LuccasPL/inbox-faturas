-- Executar no Neon antes de publicar o codigo que usa estes limites.
CREATE TABLE IF NOT EXISTS "security_rate_limits" (
  "key" text PRIMARY KEY,
  "hits" integer NOT NULL CHECK ("hits" > 0),
  "expires_at" timestamptz NOT NULL
);

ALTER TABLE "emails"
  ADD COLUMN IF NOT EXISTS "processing_started_at" timestamp,
  ADD COLUMN IF NOT EXISTS "processing_token" uuid;

-- Usar a mesma role configurada em DATABASE_URL. Aplica-se a novas sessoes.
-- Defaults na role funcionam tambem com o pooler, sem parametros de startup.
DO $$
BEGIN
  EXECUTE format('ALTER ROLE %I SET statement_timeout = %L', current_user, '15s');
  EXECUTE format('ALTER ROLE %I SET lock_timeout = %L', current_user, '5s');
  EXECUTE format('ALTER ROLE %I SET idle_in_transaction_session_timeout = %L', current_user, '30s');
END $$;
