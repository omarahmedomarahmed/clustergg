CREATE TABLE "blocked_registrations" (
	"hash" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linked_game_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"in_game_name" text,
	"region" text,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_method" text DEFAULT 'claimed' NOT NULL,
	"sync_status" text DEFAULT 'ok' NOT NULL,
	"sync_error" text,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "blocked_reason_idx" ON "blocked_registrations" USING btree ("reason");--> statement-breakpoint
CREATE UNIQUE INDEX "linked_provider_account_idx" ON "linked_game_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "linked_user_idx" ON "linked_game_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");