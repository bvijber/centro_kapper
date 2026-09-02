CREATE TYPE "public"."appointment_source" AS ENUM('customer', 'phone', 'whatsapp', 'walk_in', 'staff');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('new', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'staff');--> statement-breakpoint
CREATE TYPE "public"."waiting_list_status" AS ENUM('waiting', 'accepted', 'called', 'rejected', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_user_id" uuid,
	"guest_name" text,
	"guest_phone" text,
	"guest_email" text,
	"service_id" uuid NOT NULL,
	"service_name_snapshot" text NOT NULL,
	"price_cents_snapshot" integer NOT NULL,
	"duration_minutes_snapshot" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "appointment_status" DEFAULT 'new' NOT NULL,
	"source" "appointment_source" NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_price_cents_snapshot_check" CHECK ("appointments"."price_cents_snapshot" >= 0),
	CONSTRAINT "appointments_duration_minutes_snapshot_check" CHECK ("appointments"."duration_minutes_snapshot" > 0),
	CONSTRAINT "appointments_time_range_check" CHECK ("appointments"."starts_at" < "appointments"."ends_at"),
	CONSTRAINT "appointments_party_check" CHECK (("appointments"."customer_user_id" IS NOT NULL) OR ("appointments"."guest_name" IS NOT NULL AND "appointments"."guest_phone" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "break_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "break_periods_range_check" CHECK ("break_periods"."starts_at" < "break_periods"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "business_profile" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"phone" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Amsterdam' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_profile_singleton_check" CHECK ("business_profile"."id" = 1),
	CONSTRAINT "business_profile_timezone_check" CHECK ("business_profile"."timezone" = 'Europe/Amsterdam')
);
--> statement-breakpoint
CREATE TABLE "opening_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekday" smallint NOT NULL,
	"is_open" boolean DEFAULT false NOT NULL,
	"opening_time" time,
	"closing_time" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_hours_weekday_check" CHECK ("opening_hours"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "opening_hours_times_check" CHECK (("opening_hours"."is_open" = false) OR ("opening_hours"."opening_time" IS NOT NULL AND "opening_hours"."closing_time" IS NOT NULL AND "opening_hours"."opening_time" < "opening_hours"."closing_time"))
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"phone" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_price_cents_check" CHECK ("services"."price_cents" >= 0),
	CONSTRAINT "services_duration_minutes_check" CHECK ("services"."duration_minutes" > 0),
	CONSTRAINT "services_archive_state_check" CHECK ("services"."archived_at" IS NULL OR "services"."active" = false)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waiting_list_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_user_id" uuid,
	"guest_name" text,
	"guest_phone" text,
	"service_id" uuid NOT NULL,
	"queue_date" date NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "waiting_list_status" DEFAULT 'waiting' NOT NULL,
	"note" text,
	"accepted_at" timestamp with time zone,
	"called_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"rejected_reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waiting_list_party_check" CHECK (("waiting_list_entries"."customer_user_id" IS NOT NULL) OR ("waiting_list_entries"."guest_name" IS NOT NULL AND "waiting_list_entries"."guest_phone" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_list_entries" ADD CONSTRAINT "waiting_list_entries_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_list_entries" ADD CONSTRAINT "waiting_list_entries_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_list_entries" ADD CONSTRAINT "waiting_list_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_starts_at_status_idx" ON "appointments" USING btree ("starts_at","status");--> statement-breakpoint
CREATE INDEX "appointments_service_id_starts_at_idx" ON "appointments" USING btree ("service_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_customer_user_id_starts_at_idx" ON "appointments" USING btree ("customer_user_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_ends_at_idx" ON "appointments" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "break_periods_starts_at_idx" ON "break_periods" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_hours_weekday_unique" ON "opening_hours" USING btree ("weekday");--> statement-breakpoint
CREATE INDEX "services_active_idx" ON "services" USING btree ("active","archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "waiting_list_active_customer_date_unique" ON "waiting_list_entries" USING btree ("customer_user_id","queue_date") WHERE "waiting_list_entries"."customer_user_id" IS NOT NULL AND "waiting_list_entries"."status" IN ('waiting', 'accepted', 'called');--> statement-breakpoint
CREATE INDEX "waiting_list_queue_date_joined_at_idx" ON "waiting_list_entries" USING btree ("queue_date","joined_at");--> statement-breakpoint
CREATE INDEX "waiting_list_queue_date_status_idx" ON "waiting_list_entries" USING btree ("queue_date","status");