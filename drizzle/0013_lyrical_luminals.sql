CREATE TABLE "owner_push_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error_category" text,
	"claim_token" uuid,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_push_deliveries_status_check" CHECK ("owner_push_deliveries"."status" IN ('pending', 'sending', 'sent', 'failed', 'expired', 'invalid')),
	CONSTRAINT "owner_push_deliveries_attempts_check" CHECK ("owner_push_deliveries"."attempts" >= 0 AND "owner_push_deliveries"."attempts" <= 3),
	CONSTRAINT "owner_push_deliveries_last_error_category_check" CHECK ("owner_push_deliveries"."last_error_category" IS NULL OR "owner_push_deliveries"."last_error_category" IN ('transient', 'permanent', 'invalid', 'config', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "owner_push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh_key" text NOT NULL,
	"auth_key" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"deactivated_at" timestamp with time zone,
	"deactivate_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_push_subscriptions_deactivate_reason_check" CHECK ("owner_push_subscriptions"."deactivate_reason" IS NULL OR "owner_push_subscriptions"."deactivate_reason" IN ('opt_out', 'invalid', 'expired', 'replaced'))
);
--> statement-breakpoint
ALTER TABLE "owner_push_deliveries" ADD CONSTRAINT "owner_push_deliveries_event_id_owner_notification_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."owner_notification_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_push_deliveries" ADD CONSTRAINT "owner_push_deliveries_subscription_id_owner_push_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."owner_push_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_push_subscriptions" ADD CONSTRAINT "owner_push_subscriptions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "owner_push_deliveries_event_subscription_unique" ON "owner_push_deliveries" USING btree ("event_id","subscription_id");--> statement-breakpoint
CREATE INDEX "owner_push_deliveries_status_next_attempt_idx" ON "owner_push_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_push_subscriptions_endpoint_unique" ON "owner_push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "owner_push_subscriptions_owner_active_idx" ON "owner_push_subscriptions" USING btree ("owner_user_id","active");