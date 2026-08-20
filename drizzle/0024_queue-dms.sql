ALTER TABLE "discord_post_queue" ALTER COLUMN "channel_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "discord_post_queue" ADD COLUMN "dm_user_id" text;
