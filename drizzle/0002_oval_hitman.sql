CREATE TABLE "whole_day_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_date" date NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "whole_day_blocks_active_date_unique" ON "whole_day_blocks" USING btree ("block_date") WHERE "whole_day_blocks"."active" = true;--> statement-breakpoint
CREATE INDEX "whole_day_blocks_block_date_idx" ON "whole_day_blocks" USING btree ("block_date");