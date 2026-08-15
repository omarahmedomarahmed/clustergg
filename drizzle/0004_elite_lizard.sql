CREATE TABLE "trophies" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"value_cents" integer DEFAULT 0 NOT NULL,
	"brand_id" text,
	"challenge_id" text,
	"place" integer,
	"milestone_kind" text,
	"milestone_game" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_trophies" (
	"id" text PRIMARY KEY NOT NULL,
	"trophy_id" text NOT NULL,
	"user_id" text NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_at" timestamp with time zone,
	"swept_at" timestamp with time zone,
	"swept_reason" text
);
--> statement-breakpoint
CREATE INDEX "trophies_challenge_idx" ON "trophies" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "trophies_type_idx" ON "trophies" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "user_trophy_unique_idx" ON "user_trophies" USING btree ("trophy_id","user_id");--> statement-breakpoint
CREATE INDEX "user_trophies_user_idx" ON "user_trophies" USING btree ("user_id");