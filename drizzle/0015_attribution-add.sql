ALTER TABLE "challenge_participants" ADD COLUMN "join_guild_id" text;--> statement-breakpoint
UPDATE "challenge_participants" SET "join_guild_id" = "guild_id";--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD COLUMN "parent_guild_id_at_baseline" text;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "member_age_range" text;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "games_played" jsonb;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "invite_url" text;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "cover_image_url" text;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "eligibility_frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "eligible_this_week" boolean;
