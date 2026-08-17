CREATE TABLE "week_records" (
	"id" text PRIMARY KEY NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"guild_id" text NOT NULL,
	"guild_name" text NOT NULL,
	"eligible" boolean NOT NULL,
	"eligibility_frozen_at" timestamp with time zone,
	"linked_at_gun" integer DEFAULT 0 NOT NULL,
	"profile_complete_at_gun" boolean DEFAULT false NOT NULL,
	"ineligible_reason" text,
	"entrants" double precision DEFAULT 0 NOT NULL,
	"conversion_numerator" integer DEFAULT 0 NOT NULL,
	"conversion_denominator" integer DEFAULT 0 NOT NULL,
	"conversion" double precision DEFAULT 0 NOT NULL,
	"activation_numerator" double precision DEFAULT 0 NOT NULL,
	"activation_denominator" double precision DEFAULT 0 NOT NULL,
	"activation" double precision DEFAULT 0 NOT NULL,
	"rank" integer,
	"scored_share_cents" integer DEFAULT 0 NOT NULL,
	"flat_share_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"pool_cents" integer DEFAULT 0 NOT NULL,
	"servers_in_pool" integer DEFAULT 0 NOT NULL,
	"payout_id" text,
	"supersedes_id" text,
	"superseded_reason" text,
	"written_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "week_credits" (
	"id" text PRIMARY KEY NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"guild_id" text NOT NULL,
	"challenge_id" text NOT NULL,
	"challenge_title" text NOT NULL,
	"game" text NOT NULL,
	"brand_name" text,
	"role" text NOT NULL,
	"entrants_credited" double precision DEFAULT 0 NOT NULL,
	"entrants_whole" integer DEFAULT 0 NOT NULL,
	"scored_above_zero" integer DEFAULT 0 NOT NULL,
	"written_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "week_records_week_idx" ON "week_records" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "week_records_guild_idx" ON "week_records" USING btree ("guild_id","week_start");--> statement-breakpoint
CREATE INDEX "week_credits_week_idx" ON "week_credits" USING btree ("week_start","guild_id");--> statement-breakpoint
CREATE INDEX "week_credits_challenge_idx" ON "week_credits" USING btree ("challenge_id");
