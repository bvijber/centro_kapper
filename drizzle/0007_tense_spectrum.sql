ALTER TYPE "public"."user_role" ADD VALUE 'owner' BEFORE 'staff';--> statement-breakpoint
DROP INDEX "waiting_list_active_customer_date_unique";--> statement-breakpoint
ALTER TABLE "waiting_list_entries" ADD COLUMN "guest_access_token_hash" text;
