CREATE TABLE "spend_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"kind" text NOT NULL,
	"tier" integer,
	"payload" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"rejected_reason" text,
	"challenge_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "spend_requests_guild_idx" ON "spend_requests" USING btree ("guild_id","state");
