CREATE TABLE "discord_post_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"guild_id" text,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_challenge_id" text,
	"ledger_kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "post_queue_due_idx" ON "discord_post_queue" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "post_queue_batch_idx" ON "discord_post_queue" USING btree ("batch_id");