CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"detail" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"ref_type" text,
	"ref_id" text
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"payer_type" text NOT NULL,
	"payer_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"provider_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"payout_id" text NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pool_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"amount_cents" integer NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"released_at" timestamp with time zone,
	"released_by" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "vault_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"vault" text NOT NULL,
	"amount" integer NOT NULL,
	"kind" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"reason" text NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payout_lines_payout_idx" ON "payout_lines" USING btree ("payout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pool_week_idx" ON "pool_allocations" USING btree ("week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_guild_week_idx" ON "server_payouts" USING btree ("guild_id","week_start");--> statement-breakpoint
CREATE INDEX "ledger_vault_idx" ON "vault_ledger" USING btree ("vault");--> statement-breakpoint
CREATE INDEX "ledger_ref_idx" ON "vault_ledger" USING btree ("ref_type","ref_id");