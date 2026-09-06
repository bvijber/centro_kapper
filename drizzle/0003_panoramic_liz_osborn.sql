CREATE TABLE "booking_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"cancellation_deadline_minutes" integer DEFAULT 1440 NOT NULL,
	"overlap_behavior" text DEFAULT 'block' NOT NULL,
	"confirmation_behavior" text DEFAULT 'manual' NOT NULL,
	"no_show_release_behavior" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_settings_singleton_check" CHECK ("booking_settings"."id" = 1),
	CONSTRAINT "booking_settings_buffer_check" CHECK ("booking_settings"."buffer_minutes" >= 0),
	CONSTRAINT "booking_settings_cancellation_check" CHECK ("booking_settings"."cancellation_deadline_minutes" >= 0),
	CONSTRAINT "booking_settings_overlap_check" CHECK ("booking_settings"."overlap_behavior" IN ('block', 'allow_with_warning')),
	CONSTRAINT "booking_settings_confirmation_check" CHECK ("booking_settings"."confirmation_behavior" IN ('manual')),
	CONSTRAINT "booking_settings_no_show_check" CHECK ("booking_settings"."no_show_release_behavior" IN ('automatic', 'manual'))
);
