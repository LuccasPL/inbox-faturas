-- Link público para o cliente abrir a proforma sem login.

ALTER TABLE "faturas_draft"
  ADD COLUMN IF NOT EXISTS "proforma_share_token"     text,
  ADD COLUMN IF NOT EXISTS "proforma_share_opened_at" timestamp;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'faturas_draft_proforma_share_token_unique'
  ) THEN
    ALTER TABLE "faturas_draft"
      ADD CONSTRAINT "faturas_draft_proforma_share_token_unique"
      UNIQUE ("proforma_share_token");
  END IF;
END $$;
