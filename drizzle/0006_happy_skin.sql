DROP INDEX "waiting_list_active_customer_date_unique";--> statement-breakpoint
DROP INDEX "waiting_list_queue_date_status_idx";--> statement-breakpoint
ALTER TABLE "waiting_list_entries" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "waiting_list_entries" ALTER COLUMN "status" SET DEFAULT 'waiting'::text;--> statement-breakpoint
DROP TYPE "public"."waiting_list_status";--> statement-breakpoint
CREATE TYPE "public"."waiting_list_status" AS ENUM('waiting', 'called', 'in_service', 'completed', 'cancelled', 'skipped');--> statement-breakpoint
ALTER TABLE "waiting_list_entries" ALTER COLUMN "status" SET DEFAULT 'waiting'::"public"."waiting_list_status";--> statement-breakpoint
ALTER TABLE "waiting_list_entries" ALTER COLUMN "status" SET DATA TYPE "public"."waiting_list_status" USING "status"::"public"."waiting_list_status";--> statement-breakpoint
ALTER TABLE "waiting_list_entries" ADD COLUMN "appointment_id" uuid;--> statement-breakpoint
ALTER TABLE "waiting_list_entries" ADD CONSTRAINT "waiting_list_entries_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waiting_list_appointment_unique" ON "waiting_list_entries" USING btree ("appointment_id") WHERE "waiting_list_entries"."appointment_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "waiting_list_active_customer_date_unique" ON "waiting_list_entries" USING btree ("customer_user_id","queue_date") WHERE "waiting_list_entries"."customer_user_id" IS NOT NULL AND "waiting_list_entries"."status" IN ('waiting', 'called', 'in_service');--> statement-breakpoint
CREATE INDEX "waiting_list_queue_date_status_idx" ON "waiting_list_entries" USING btree ("queue_date","status");--> statement-breakpoint
ALTER TABLE "waiting_list_entries" DROP COLUMN "accepted_at";--> statement-breakpoint
ALTER TABLE "waiting_list_entries" DROP COLUMN "rejected_at";--> statement-breakpoint
ALTER TABLE "waiting_list_entries" DROP COLUMN "rejected_reason";
