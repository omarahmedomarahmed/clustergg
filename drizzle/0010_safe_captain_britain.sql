CREATE TABLE "staff" (
	"user_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"department" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
