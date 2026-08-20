CREATE TABLE "content_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"settings" jsonb,
	"edited_by" text NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "content_overrides_key_idx" ON "content_overrides" USING btree ("scope","key","edited_at");
