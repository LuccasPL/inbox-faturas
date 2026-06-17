-- Alertas internos por email quando entra um novo pedido relevante.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "notif_email" text,
  ADD COLUMN IF NOT EXISTS "notif_enabled" boolean NOT NULL DEFAULT false;
