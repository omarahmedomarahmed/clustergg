CREATE TABLE "deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"kind" text NOT NULL,
	"recipient" text NOT NULL,
	"user_id" text,
	"guild_id" text,
	"subject" text,
	"status" text NOT NULL,
	"error" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "deliveries_status_idx" ON "deliveries" USING btree ("status","attempted_at");--> statement-breakpoint
CREATE INDEX "deliveries_recipient_idx" ON "deliveries" USING btree ("recipient");--> statement-breakpoint
CREATE INDEX "deliveries_guild_idx" ON "deliveries" USING btree ("guild_id");
