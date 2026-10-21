CREATE TABLE "owner_notification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedup_key" text NOT NULL,
	"event" text NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_notification_events_event_check" CHECK ("owner_notification_events"."event" IN ('queue_joined', 'queue_left', 'appointment_booked', 'appointment_cancelled')),
	CONSTRAINT "owner_notification_events_entity_type_check" CHECK ("owner_notification_events"."entity_type" IN ('queue_entry', 'appointment'))
);
--> statement-breakpoint
CREATE TABLE "owner_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owner_notification_events" ADD CONSTRAINT "owner_notification_events_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_notifications" ADD CONSTRAINT "owner_notifications_event_id_owner_notification_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."owner_notification_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_notifications" ADD CONSTRAINT "owner_notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "owner_notification_events_dedup_key_unique" ON "owner_notification_events" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX "owner_notification_events_recipient_idx" ON "owner_notification_events" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_notifications_event_unique" ON "owner_notifications" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "owner_notifications_recipient_read_created_idx" ON "owner_notifications" USING btree ("recipient_user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "owner_notifications_created_at_idx" ON "owner_notifications" USING btree ("created_at");