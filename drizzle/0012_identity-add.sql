CREATE TABLE "brand_users" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"invite_key_hash" text,
	"invite_redeemed_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"last_login_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "guild_admins" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"discord_id" text NOT NULL,
	"source" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "owner_discord_id" text;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "owner_first_sign_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "owner_dm_state" text;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "installed_by_discord_id" text;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "installer_was_owner" boolean;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "ownership_transfer_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "transfer_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "parent_guild_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "parent_stamped_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "brand_users_brand_idx" ON "brand_users" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_admin_unique_idx" ON "guild_admins" USING btree ("guild_id","discord_id");--> statement-breakpoint
CREATE INDEX "password_resets_subject_idx" ON "password_resets" USING btree ("subject_kind","subject_id");