CREATE TABLE "push_notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error_category" text,
	"claim_token" uuid,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_notification_deliveries_status_check" CHECK ("push_notification_deliveries"."status" IN ('pending', 'sending', 'sent', 'failed', 'expired', 'invalid')),
	CONSTRAINT "push_notification_deliveries_attempts_check" CHECK ("push_notification_deliveries"."attempts" >= 0 AND "push_notification_deliveries"."attempts" <= 3),
	CONSTRAINT "push_notification_deliveries_last_error_category_check" CHECK ("push_notification_deliveries"."last_error_category" IS NULL OR "push_notification_deliveries"."last_error_category" IN ('transient', 'permanent', 'invalid', 'config', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "push_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_entry_id" uuid NOT NULL,
	"event" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_notifications_event_check" CHECK ("push_notifications"."event" IN ('called')),
	CONSTRAINT "push_notifications_status_check" CHECK ("push_notifications"."status" IN ('pending', 'sending', 'sent', 'failed', 'expired', 'invalid'))
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_entry_id" uuid NOT NULL,
	"customer_user_id" uuid,
	"endpoint" text NOT NULL,
	"p256dh_key" text NOT NULL,
	"auth_key" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"deactivated_at" timestamp with time zone,
	"deactivate_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_deactivate_reason_check" CHECK ("push_subscriptions"."deactivate_reason" IS NULL OR "push_subscriptions"."deactivate_reason" IN ('entry_ended', 'opt_out', 'invalid', 'expired', 'replaced'))
);
--> statement-breakpoint
ALTER TABLE "push_notification_deliveries" ADD CONSTRAINT "push_notification_deliveries_notification_id_push_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."push_notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notification_deliveries" ADD CONSTRAINT "push_notification_deliveries_subscription_id_push_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."push_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notifications" ADD CONSTRAINT "push_notifications_queue_entry_id_waiting_list_entries_id_fk" FOREIGN KEY ("queue_entry_id") REFERENCES "public"."waiting_list_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_queue_entry_id_waiting_list_entries_id_fk" FOREIGN KEY ("queue_entry_id") REFERENCES "public"."waiting_list_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_notification_deliveries_notification_subscription_unique" ON "push_notification_deliveries" USING btree ("notification_id","subscription_id");--> statement-breakpoint
CREATE INDEX "push_notification_deliveries_status_next_attempt_idx" ON "push_notification_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_notifications_idempotency_unique" ON "push_notifications" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "push_notifications_status_created_at_idx" ON "push_notifications" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_entry_active_idx" ON "push_subscriptions" USING btree ("queue_entry_id","active");