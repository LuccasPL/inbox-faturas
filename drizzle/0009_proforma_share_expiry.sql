-- Executar antes de publicar o codigo de partilha com validade.
-- Links existentes recebem 7 dias apenas na primeira aplicacao.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'faturas_draft'
      AND column_name = 'proforma_share_expires_at'
  ) THEN
    ALTER TABLE "faturas_draft"
      ADD COLUMN "proforma_share_expires_at" timestamp with time zone;
    UPDATE "faturas_draft"
      SET "proforma_share_expires_at" = now() + interval '7 days'
      WHERE "proforma_share_token" IS NOT NULL;
  END IF;
END $$;
