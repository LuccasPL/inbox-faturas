-- Map 1:1 between Clerk user and tenant.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "clerk_user_id" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_clerk_user_id_unique'
  ) THEN
    ALTER TABLE "tenants"
      ADD CONSTRAINT "tenants_clerk_user_id_unique" UNIQUE ("clerk_user_id");
  END IF;
END $$;
