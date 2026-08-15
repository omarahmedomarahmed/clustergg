CREATE TABLE "observations" (
	"id" text PRIMARY KEY NOT NULL,
	"linked_account_id" text NOT NULL,
	"provider" text NOT NULL,
	"metric_key" text NOT NULL,
	"value" integer NOT NULL,
	"rank_label" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_resets" (
	"id" text PRIMARY KEY NOT NULL,
	"linked_account_id" text NOT NULL,
	"metric_key" text NOT NULL,
	"previous_value" integer NOT NULL,
	"new_value" integer NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linked_game_accounts" ADD COLUMN "next_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "linked_game_accounts" ADD COLUMN "provider_data" jsonb;--> statement-breakpoint
CREATE INDEX "observations_account_metric_idx" ON "observations" USING btree ("linked_account_id","metric_key","observed_at");--> statement-breakpoint
CREATE INDEX "season_resets_account_idx" ON "season_resets" USING btree ("linked_account_id");