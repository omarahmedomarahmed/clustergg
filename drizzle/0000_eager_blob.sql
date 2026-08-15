CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"email_verified_at" timestamp with time zone,
	"age_band" text,
	"country" text,
	"discord_id" text,
	"attributed_guild_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_slug_unique" UNIQUE("slug"),
	CONSTRAINT "users_discord_id_unique" UNIQUE("discord_id")
);
--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");