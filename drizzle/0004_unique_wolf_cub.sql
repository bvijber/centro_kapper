ALTER TABLE "appointments" DROP CONSTRAINT "appointments_party_check";--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "barber_user_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "buffer_minutes_at_booking" integer;--> statement-breakpoint
UPDATE "appointments" SET "buffer_minutes_at_booking" = COALESCE((SELECT "buffer_minutes" FROM "booking_settings" WHERE "id" = 1), 0) WHERE "buffer_minutes_at_booking" IS NULL;--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "buffer_minutes_at_booking" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "slot_released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "override_opening_hours" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "override_break" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "override_whole_day_block" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_barber_user_id_users_id_fk" FOREIGN KEY ("barber_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_buffer_minutes_at_booking_check" CHECK ("appointments"."buffer_minutes_at_booking" >= 0);--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_slot_release_check" CHECK ("appointments"."slot_released_at" IS NULL OR "appointments"."status" = 'no_show');--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_party_check" CHECK (("appointments"."customer_user_id" IS NOT NULL AND "appointments"."guest_name" IS NULL AND "appointments"."guest_phone" IS NULL AND "appointments"."guest_email" IS NULL) OR ("appointments"."customer_user_id" IS NULL AND "appointments"."guest_name" IS NOT NULL AND "appointments"."guest_phone" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN "source";--> statement-breakpoint
DROP TYPE "public"."appointment_source";
