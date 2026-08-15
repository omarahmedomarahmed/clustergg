CREATE TABLE "guild_members" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "guild_member_unique_idx" ON "guild_members" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "guild_member_user_idx" ON "guild_members" USING btree ("user_id");