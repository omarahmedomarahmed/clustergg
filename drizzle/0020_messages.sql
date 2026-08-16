CREATE TABLE "message_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"side" text NOT NULL,
	"guild_id" text,
	"brand_id" text,
	"subject" text,
	"last_message_at" timestamp with time zone,
	"last_author_kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"author_kind" text NOT NULL,
	"author_id" text,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "message_threads_side_idx" ON "message_threads" USING btree ("side","last_message_at");--> statement-breakpoint
CREATE INDEX "message_threads_guild_idx" ON "message_threads" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "message_threads_brand_idx" ON "message_threads" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("thread_id","sent_at");
