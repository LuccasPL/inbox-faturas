-- Migration: add_clerk_user_id
-- Mapeamento 1:1 entre utilizador Clerk e tenant.

ALTER TABLE "tenants"
  ADD COLUMN "clerk_user_id" text;

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_clerk_user_id_unique" UNIQUE ("clerk_user_id");
