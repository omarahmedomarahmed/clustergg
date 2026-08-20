CREATE TABLE "profile_themes" (
	"user_id" text PRIMARY KEY NOT NULL,
	"theme" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
