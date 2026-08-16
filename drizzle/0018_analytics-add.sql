CREATE TABLE "guild_analytics_consent" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"granted_by" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_pull_at" timestamp with time zone,
	"cooldown_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "guild_snapshots" ADD COLUMN "taken_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_snapshots" ADD COLUMN "taken_by" text;--> statement-breakpoint
ALTER TABLE "guild_snapshots" ADD COLUMN "roles_json" jsonb;--> statement-breakpoint
ALTER TABLE "guild_snapshots" ADD COLUMN "role_holders_json" jsonb;--> statement-breakpoint
CREATE INDEX "guild_snapshots_guild_idx" ON "guild_snapshots" USING btree ("guild_id","taken_at");
