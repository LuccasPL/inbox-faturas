-- Idempotência para inbound email events (Postmark).

ALTER TABLE "emails"
  ADD COLUMN IF NOT EXISTS "provider_event_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "emails_provider_event_key_uidx"
  ON "emails" ("provider_event_key");
