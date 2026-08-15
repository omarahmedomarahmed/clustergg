CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"logo_url" text,
	"portal_key_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "challenge_announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"member_count_at" integer DEFAULT 0 NOT NULL,
	"announced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"user_id" text NOT NULL,
	"linked_account_id" text NOT NULL,
	"guild_id" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"baseline_at" timestamp with time zone,
	"baseline" jsonb,
	"rank_at_join" integer,
	"rank_label_at_join" text,
	"frozen_score" integer,
	"frozen_at" timestamp with time zone,
	"placement" integer
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"game" text NOT NULL,
	"provider" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'sponsored' NOT NULL,
	"sponsor_brand_id" text,
	"guild_id" text,
	"series_id" text,
	"series_index" integer,
	"cadence" text DEFAULT 'weekly' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"prize_pool_cents" integer DEFAULT 0 NOT NULL,
	"places" integer DEFAULT 1 NOT NULL,
	"metrics" jsonb,
	"queue" text DEFAULT 'solo' NOT NULL,
	"rank_min" integer,
	"rank_max" integer,
	"access_key" text,
	"invoice_id" text,
	"announced_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"member_count" integer NOT NULL,
	"linked_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"admin_role_id" text,
	"announce_channel_id" text,
	"community" text,
	"portal_key_hash" text,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "guilds_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_unique_idx" ON "challenge_announcements" USING btree ("challenge_id","guild_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_unique_idx" ON "challenge_participants" USING btree ("challenge_id","user_id");--> statement-breakpoint
CREATE INDEX "participant_challenge_idx" ON "challenge_participants" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "participant_account_idx" ON "challenge_participants" USING btree ("linked_account_id");--> statement-breakpoint
CREATE INDEX "challenges_state_idx" ON "challenges" USING btree ("state");--> statement-breakpoint
CREATE INDEX "challenges_start_idx" ON "challenges" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "challenges_series_idx" ON "challenges" USING btree ("series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_snapshot_week_idx" ON "guild_snapshots" USING btree ("guild_id","week_start");--> statement-breakpoint
CREATE INDEX "guilds_removed_idx" ON "guilds" USING btree ("removed_at");