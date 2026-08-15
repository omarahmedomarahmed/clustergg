CREATE TABLE "staff_titles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"departments" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "staff_title_id" text;