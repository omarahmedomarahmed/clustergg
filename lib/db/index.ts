import { sql as dsql } from "drizzle-orm";
import * as schema from "./schema";

export type DB = ReturnType<typeof import("drizzle-orm/neon-http").drizzle<typeof schema>> |
  ReturnType<typeof import("drizzle-orm/pglite").drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __clusterDb: Promise<DB> | undefined;
}

export const isDemoMode = !process.env.DATABASE_URL;

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const r = result as { rows?: Record<string, unknown>[] };
  return r?.rows ?? [];
}

// Zero-terminal provisioning: if the Neon database is empty, create the full
// schema and seed platform defaults (+ superadmin from env) on first connect.
// Idempotent column back-fills for databases provisioned before a column was
// added. Every entry uses ADD COLUMN IF NOT EXISTS, so this is a no-op once the
// column exists. Append here whenever the schema gains a column — this is our
// lightweight, zero-downtime migration path for the live Neon database.
const COLUMN_MIGRATIONS = [
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "title" text`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "theme" jsonb NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_visibility" text NOT NULL DEFAULT 'public'`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "allow_messages_from" text NOT NULL DEFAULT 'everyone'`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_notifications" boolean NOT NULL DEFAULT true`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "discord_username" text`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_views" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "show_in_nav" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "hero_layout" jsonb`,
  `ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "planet_image_url" text`,
  `ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "planet_bg_url" text`,
  `ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "planet_pins" jsonb NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "cadence" text NOT NULL DEFAULT 'custom'`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "hero_type" text NOT NULL DEFAULT 'image'`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "hero_url" text`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "cover_url" text`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "cover_adjust" jsonb NOT NULL DEFAULT '{"zoom":1,"x":50,"y":50}'::jsonb`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "trophy_id" text`,
  `ALTER TABLE "challenge_participants" ADD COLUMN IF NOT EXISTS "final_placement" integer`,
  // ----- Quests & gamification (new tables; idempotent so both fresh and
  // existing databases converge without editing the static DDL string) -----
  `CREATE TABLE IF NOT EXISTS "quests" (
    "id" text PRIMARY KEY NOT NULL,
    "key" text NOT NULL UNIQUE,
    "name" text NOT NULL,
    "tagline" text NOT NULL DEFAULT '',
    "lore" text NOT NULL DEFAULT '',
    "color" text NOT NULL DEFAULT '#8b5cf6',
    "accent2" text NOT NULL DEFAULT '#22d3ee',
    "icon" text NOT NULL DEFAULT 'trophy',
    "logo_url" text,
    "card_bg_url" text,
    "cover_url" text,
    "action_weights" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "daily_caps" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "sort_order" integer NOT NULL DEFAULT 0,
    "is_active" boolean NOT NULL DEFAULT true
  )`,
  `CREATE TABLE IF NOT EXISTS "quest_tiers" (
    "id" text PRIMARY KEY NOT NULL,
    "quest_id" text NOT NULL,
    "tier_index" integer NOT NULL DEFAULT 0,
    "name" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "threshold_qp" integer NOT NULL DEFAULT 100,
    "icon_url" text,
    "color" text,
    "is_active" boolean NOT NULL DEFAULT true
  )`,
  `CREATE INDEX IF NOT EXISTS "qt_quest_idx" ON "quest_tiers" ("quest_id","tier_index")`,
  `CREATE TABLE IF NOT EXISTS "user_quest_progress" (
    "user_id" text NOT NULL,
    "quest_id" text NOT NULL,
    "qp" integer NOT NULL DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "user_quest_progress_pk" PRIMARY KEY("user_id","quest_id")
  )`,
  `CREATE TABLE IF NOT EXISTS "quest_events" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "quest_id" text NOT NULL,
    "action_key" text NOT NULL,
    "qp_awarded" integer NOT NULL DEFAULT 0,
    "ref_type" text,
    "ref_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  // B34: what this event PAID, as distinct from what it PROGRESSED. Nullable on
  // purpose — NULL means "written before B34, when the two were the same
  // number", and every reader coalesces to qp_awarded. A backfill would have had
  // to re-run every boot and would then re-credit the new progress-only rows,
  // which are exactly the rows that must pay nothing.
  `ALTER TABLE "quest_events" ADD COLUMN IF NOT EXISTS "cp_awarded" integer`,
  `CREATE INDEX IF NOT EXISTS "qe_user_idx" ON "quest_events" ("user_id","created_at")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "qe_dedup_idx" ON "quest_events" ("user_id","quest_id","action_key","ref_type","ref_id")`,
  `CREATE TABLE IF NOT EXISTS "user_quest_tiers" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "quest_tier_id" text NOT NULL,
    "awarded_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uqt_user_tier_idx" ON "user_quest_tiers" ("user_id","quest_tier_id")`,
  `ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "map_art_url" text`,
  `ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "path_points" jsonb`,
  `ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "path_points_mobile" jsonb`,
  `ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "map_video_url" text`,
  `ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "map_glb_url" text`,
  `ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "map_glb_cfg" jsonb`,
  `ALTER TABLE "trophies" ADD COLUMN IF NOT EXISTS "value" double precision NOT NULL DEFAULT 0`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payout_method" jsonb`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payout_changes" integer NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS "user_trophies" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "trophy_id" text NOT NULL,
    "challenge_id" text,
    "placement" integer DEFAULT 1 NOT NULL,
    "status" text DEFAULT 'held' NOT NULL,
    "awarded_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ut_user_trophy_chal_idx" ON "user_trophies" ("user_id","trophy_id","challenge_id")`,
  `CREATE TABLE IF NOT EXISTS "trophy_redeems" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "award_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "amount" double precision DEFAULT 0 NOT NULL,
    "currency" text DEFAULT 'USD' NOT NULL,
    "method" text DEFAULT 'ach' NOT NULL,
    "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "gamer_confirmed_at" timestamp with time zone,
    "proof_url" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "decided_at" timestamp with time zone,
    "paid_at" timestamp with time zone
  )`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "prizes" jsonb`,
  `ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "missions_config" jsonb`,
  `ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "game_ui" jsonb`,
  `ALTER TABLE "quest_tiers" ADD COLUMN IF NOT EXISTS "map_x" integer NOT NULL DEFAULT 50`,
  `ALTER TABLE "quest_tiers" ADD COLUMN IF NOT EXISTS "map_y" integer NOT NULL DEFAULT 50`,
  `ALTER TABLE "user_quest_progress" ADD COLUMN IF NOT EXISTS "completions" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "user_quest_progress" ADD COLUMN IF NOT EXISTS "lifetime_qp" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "gate_quest_id" text`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "gate_min_badges" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "feed_prefs" jsonb NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "slug" text`,
  `ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "access_key" text`,
  `ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "cover_url" text`,
  `ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "about" text`,
  `ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "portal_bg_url" text`,
  // The founding offers. Nullable and defaulted, so every row that already
  // exists reads as "owed it" rather than as "had it" — which is the whole
  // point: the offer is retroactive.
  `ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "founder_credit_at" timestamptz`,
  `ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "founder_credit_value" double precision NOT NULL DEFAULT 0`,
  `ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "chart_prefs" jsonb`,
  `ALTER TABLE "ad_campaigns" ADD COLUMN IF NOT EXISTS "launched_at" timestamp with time zone`,
  `ALTER TABLE "ad_campaigns" ADD COLUMN IF NOT EXISTS "cover_url" text`,
  `ALTER TABLE "ad_campaigns" ADD COLUMN IF NOT EXISTS "logo_url" text`,
  `CREATE TABLE IF NOT EXISTS "brand_messages" (
    "id" text PRIMARY KEY NOT NULL,
    "brand_id" text NOT NULL,
    "sender" text NOT NULL,
    "body" text NOT NULL,
    "read_by_admin" boolean NOT NULL DEFAULT false,
    "read_by_brand" boolean NOT NULL DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "brand_msg_idx" ON "brand_messages" ("brand_id","created_at")`,
  `ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "custom_metrics" jsonb NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "accent" text`,
  `ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "accent2" text`,
  `ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "planet_layout" text NOT NULL DEFAULT 'auto'`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locale" text NOT NULL DEFAULT 'en'`,
  `CREATE TABLE IF NOT EXISTS "game_entity_overrides" (
    "id" text PRIMARY KEY,
    "game" text NOT NULL,
    "kind" text NOT NULL,
    "entity_id" text NOT NULL,
    "custom" boolean NOT NULL DEFAULT false,
    "hidden" boolean NOT NULL DEFAULT false,
    "sort_order" integer NOT NULL DEFAULT 0,
    "name" text,
    "role" text,
    "image" text,
    "splash" text,
    "lore" text,
    "meta" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "abilities" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "skins" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "geo_game_kind_entity_idx" ON "game_entity_overrides" ("game","kind","entity_id")`,
  `CREATE TABLE IF NOT EXISTS "card_renders" (
    "id" text PRIMARY KEY NOT NULL,
    "kind" text NOT NULL,
    "cache_key" text NOT NULL,
    "data_hash" text NOT NULL,
    "url" text NOT NULL,
    "bytes" integer NOT NULL DEFAULT 0,
    "hits" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "card_render_idx" ON "card_renders" ("kind","cache_key")`,
  `ALTER TABLE "challenge_participants" ADD COLUMN IF NOT EXISTS "joined_from" text NOT NULL DEFAULT 'web'`,
  `CREATE TABLE IF NOT EXISTS "discord_guilds" (
    "guild_id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL DEFAULT '',
    "icon_url" text,
    "owner_discord_id" text,
    "member_count" integer NOT NULL DEFAULT 0,
    "channel_id" text,
    "status" text NOT NULL DEFAULT 'active',
    "announcements_enabled" boolean NOT NULL DEFAULT true,
    "ad_opt_in" boolean NOT NULL DEFAULT true,
    "ad_unlocked_at" timestamp with time zone,
    "revenue_share_pct" integer NOT NULL DEFAULT 70,
    "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "installed_at" timestamp with time zone DEFAULT now() NOT NULL,
    "removed_at" timestamp with time zone
  )`,
  `CREATE TABLE IF NOT EXISTS "discord_guild_members" (
    "guild_id" text NOT NULL,
    "user_id" text NOT NULL,
    "attributed_via" text NOT NULL DEFAULT 'bot',
    "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
    "first_linked_at" timestamp with time zone,
    "left_at" timestamp with time zone,
    PRIMARY KEY ("guild_id","user_id")
  )`,
  `CREATE INDEX IF NOT EXISTS "dgm_guild_idx" ON "discord_guild_members" ("guild_id","first_linked_at")`,
  // AFTER the CREATE above, not before it. An ALTER that runs before its table
  // exists takes the whole boot with it, and this array is executed in order.
  `ALTER TABLE "discord_guilds" ADD COLUMN IF NOT EXISTS "welcome_challenge_at" timestamptz`,
  `ALTER TABLE "discord_guilds" ADD COLUMN IF NOT EXISTS "welcome_challenge_id" text`,
  `CREATE TABLE IF NOT EXISTS "discord_command_logs" (
    "id" text PRIMARY KEY NOT NULL,
    "guild_id" text,
    "user_id" text,
    "discord_id" text,
    "command" text NOT NULL,
    "screen" text,
    "arg" text,
    "latency_ms" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "dcl_guild_idx" ON "discord_command_logs" ("guild_id","created_at")`,
  `CREATE TABLE IF NOT EXISTS "discord_ad_posts" (
    "id" text PRIMARY KEY NOT NULL,
    "guild_id" text NOT NULL,
    "campaign_creative_id" text,
    "channel_id" text,
    "message_id" text,
    "status" text NOT NULL DEFAULT 'posted',
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "dap_guild_idx" ON "discord_ad_posts" ("guild_id","created_at")`,
  `CREATE TABLE IF NOT EXISTS "discord_week_posts" (
    "id" text PRIMARY KEY NOT NULL,
    "guild_id" text NOT NULL,
    "post_key" text NOT NULL,
    "week_key" text NOT NULL,
    "kind" text NOT NULL DEFAULT 'update',
    "channel_id" text,
    "message_id" text,
    "status" text NOT NULL DEFAULT 'posted',
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "dwp_guild_key_idx" ON "discord_week_posts" ("guild_id","post_key")`,
  `CREATE INDEX IF NOT EXISTS "dwp_week_idx" ON "discord_week_posts" ("week_key")`,
  `ALTER TABLE "ad_impressions" ADD COLUMN IF NOT EXISTS "guild_id" text`,
  // Retiring a creative instead of deleting its row: impressions and clicks
  // point at this row and cascade with it, so a brand replacing their art used
  // to erase the placement's whole history.
  `ALTER TABLE "ad_campaign_creatives" ADD COLUMN IF NOT EXISTS "retired_at" timestamptz`,
  `ALTER TABLE "ad_creatives" ADD COLUMN IF NOT EXISTS "cta_label" text`,
  `ALTER TABLE "discord_guilds" ADD COLUMN IF NOT EXISTS "community" jsonb NOT NULL DEFAULT '{}'::jsonb`,
  `CREATE TABLE IF NOT EXISTS "sponsored_campaigns" (
    "id" text PRIMARY KEY NOT NULL,
    "brand_id" text NOT NULL,
    "game" text NOT NULL,
    "slots" integer DEFAULT 4 NOT NULL,
    "price_per_challenge" double precision DEFAULT 250 NOT NULL,
    "total" double precision DEFAULT 1000 NOT NULL,
    "status" text DEFAULT 'submitted' NOT NULL,
    "start_at" timestamp with time zone NOT NULL,
    "cover_url" text,
    "slot_state" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "targeting" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "spc_brand_idx" ON "sponsored_campaigns" ("brand_id","created_at")`,
  `CREATE INDEX IF NOT EXISTS "spc_game_idx" ON "sponsored_campaigns" ("game","status")`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "sponsor_brand_id" text`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "sponsor_campaign_id" text`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "sponsor_price" double precision NOT NULL DEFAULT 0`,
  `ALTER TABLE "ad_clicks" ADD COLUMN IF NOT EXISTS "guild_id" text`,
  `ALTER TABLE "ad_clicks" ADD COLUMN IF NOT EXISTS "source" text`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'public'`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "guild_id" text`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "access_key" text`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "announce_hype" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "guild_ids" jsonb NOT NULL DEFAULT '[]'::jsonb`,

  // Repeating challenges.
  //
  // A weekly challenge is not one row whose dates keep moving — it is a SERIES
  // of separate rows, one per run, because each run is a unit of revenue with
  // its own entrants, standings, winners, trophies and reach. Week 2 must be
  // reportable on its own a year later, which a sliding window cannot do.
  //
  // `series_id` groups them (the first run's own id), `run_index` numbers them,
  // `runs_planned` is how many were bought (4 for a month; 0 = until stopped),
  // and `base_title` is the title without the "— Week N" suffix so the suffix
  // is never appended twice.
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "series_id" text`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "run_index" integer NOT NULL DEFAULT 1`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "runs_planned" integer NOT NULL DEFAULT 1`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "base_title" text`,
  `CREATE INDEX IF NOT EXISTS "ch_series_idx" ON "challenges" ("series_id","run_index")`,
  // Existing challenges are a series of one, named after themselves. Without
  // this every legacy row has a null series and cannot be grouped or repeated.
  `UPDATE "challenges" SET "series_id" = "id" WHERE "series_id" IS NULL`,
  `UPDATE "challenges" SET "base_title" = "title" WHERE "base_title" IS NULL`,
  `ALTER TABLE "discord_guilds" ADD COLUMN IF NOT EXISTS "invite_url" text`,
  `ALTER TABLE "discord_guilds" ADD COLUMN IF NOT EXISTS "slug" text`,
  `ALTER TABLE "discord_guilds" ADD COLUMN IF NOT EXISTS "portal_key" text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "dg_slug_idx" ON "discord_guilds" ("slug") WHERE "slug" IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS "server_events" (
    "id" text PRIMARY KEY NOT NULL,
    "guild_id" text NOT NULL,
    "type" text NOT NULL,
    "challenge_id" text,
    "user_id" text,
    "session_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "sev_guild_idx" ON "server_events" ("guild_id","type","created_at")`,
  `CREATE TABLE IF NOT EXISTS "challenge_requests" (
    "id" text PRIMARY KEY NOT NULL,
    "guild_id" text NOT NULL,
    "requested_by_discord_id" text,
    "requested_by_user_id" text,
    "game" text NOT NULL,
    "provider" text NOT NULL,
    "title" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "format" text NOT NULL DEFAULT 'top3',
    "metric" text,
    "days" integer NOT NULL DEFAULT 7,
    "prize_value" integer NOT NULL DEFAULT 0,
    "prize_currency" text NOT NULL DEFAULT 'USD',
    "prize_description" text,
    "prizes" jsonb,
    "status" text NOT NULL DEFAULT 'pending',
    "review_note" text,
    "reviewed_by" text,
    "reviewed_at" timestamp with time zone,
    "challenge_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "creq_guild_idx" ON "challenge_requests" ("guild_id","created_at")`,
  `CREATE INDEX IF NOT EXISTS "creq_status_idx" ON "challenge_requests" ("status")`,
  // A brand's bought slot arrives in the same queue as a server owner's ask.
  // These must come AFTER the CREATE above: on a fresh database an ALTER
  // placed earlier in the array runs against a table that doesn't exist yet
  // and takes the whole boot down with it.
  `ALTER TABLE "challenge_requests" ADD COLUMN IF NOT EXISTS "brand_id" text`,
  `ALTER TABLE "challenge_requests" ADD COLUMN IF NOT EXISTS "campaign_id" text`,
  `ALTER TABLE "challenge_requests" ADD COLUMN IF NOT EXISTS "slot_index" integer`,
  `ALTER TABLE "trophies" ADD COLUMN IF NOT EXISTS "brand_id" text`,
  `CREATE TABLE IF NOT EXISTS "challenge_deliveries" (
    "id" text PRIMARY KEY NOT NULL,
    "challenge_id" text NOT NULL,
    "guild_id" text NOT NULL,
    "members" integer DEFAULT 0 NOT NULL,
    "linked" integer DEFAULT 0 NOT NULL,
    "kind" text DEFAULT 'launch' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "cdel_once_idx" ON "challenge_deliveries" ("challenge_id","guild_id","kind")`,
  `CREATE INDEX IF NOT EXISTS "cdel_challenge_idx" ON "challenge_deliveries" ("challenge_id")`,
  `CREATE TABLE IF NOT EXISTS "brand_testimonials" (
    "id" text PRIMARY KEY NOT NULL,
    "brand_id" text NOT NULL,
    "campaign_id" text,
    "challenge_id" text,
    "user_id" text,
    "name" text DEFAULT '' NOT NULL,
    "quote" text NOT NULL,
    "status" text DEFAULT 'published' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "btm_brand_idx" ON "brand_testimonials" ("brand_id","created_at")`,
  `CREATE TABLE IF NOT EXISTS "server_messages" (
    "id" text PRIMARY KEY NOT NULL,
    "guild_id" text NOT NULL,
    "sender" text NOT NULL,
    "body" text NOT NULL,
    "discord_user_id" text,
    "source" text DEFAULT 'portal' NOT NULL,
    "delivered_at" timestamp with time zone,
    "delivery_error" text,
    "read_by_admin" boolean DEFAULT false NOT NULL,
    "read_by_owner" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "srv_msg_idx" ON "server_messages" ("guild_id","created_at")`,
  `CREATE TABLE IF NOT EXISTS "departments" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "purpose" text DEFAULT '' NOT NULL,
    "systems" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "department_id" text`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "vote_count" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "discord_views" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birth_date" timestamptz`,
  `CREATE TABLE IF NOT EXISTS "discord_post_queue" (
    "id" text PRIMARY KEY,
    "batch_id" text NOT NULL,
    "channel_id" text NOT NULL,
    "guild_id" text,
    "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "ledger_challenge_id" text,
    "ledger_kind" text,
    "status" text NOT NULL DEFAULT 'pending',
    "attempts" integer NOT NULL DEFAULT 0,
    "last_error" text,
    "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
    "posted_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "dpq_drain_idx" ON "discord_post_queue" ("status","next_attempt_at")`,
  `CREATE INDEX IF NOT EXISTS "dpq_batch_idx" ON "discord_post_queue" ("batch_id")`,
  `CREATE TABLE IF NOT EXISTS "profile_votes" (
    "profile_user_id" text NOT NULL,
    "voter_user_id" text,
    "voter_discord_id" text,
    "guild_id" text,
    "source" text NOT NULL DEFAULT 'web',
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "id" text PRIMARY KEY NOT NULL
  )`,
  `ALTER TABLE "profile_votes" ADD COLUMN IF NOT EXISTS "week_key" text`,
  // Existing votes predate the weekly competition, so they're filed into the
  // week they were actually cast in — a Monday-anchored ISO date, computed in
  // SQL so the backfill needs no application pass. Sunday votes get NULL, the
  // same as they would today.
  `UPDATE "profile_votes" SET "week_key" = to_char(date_trunc('week', "created_at" AT TIME ZONE 'UTC'), 'YYYY-MM-DD')
     WHERE "week_key" IS NULL AND EXTRACT(ISODOW FROM ("created_at" AT TIME ZONE 'UTC')) <> 7`,
  // Uniqueness moves from per-lifetime to per-WEEK. The old indexes have to go
  // first: leaving them would keep every gamer to one vote ever, which is the
  // exact thing the weekly competition can't have.
  `DROP INDEX IF EXISTS "pv_web_idx"`,
  `DROP INDEX IF EXISTS "pv_discord_idx"`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "pv_web_week_idx" ON "profile_votes" ("profile_user_id","voter_user_id","week_key") WHERE "voter_user_id" IS NOT NULL AND "week_key" IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "pv_discord_week_idx" ON "profile_votes" ("profile_user_id","voter_discord_id","week_key") WHERE "voter_discord_id" IS NOT NULL AND "week_key" IS NOT NULL`,
  // Announcement-day votes carry no week, so the partial indexes above don't
  // constrain them. These keep one-per-voter for that day too.
  `CREATE UNIQUE INDEX IF NOT EXISTS "pv_web_nullweek_idx" ON "profile_votes" ("profile_user_id","voter_user_id") WHERE "voter_user_id" IS NOT NULL AND "week_key" IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "pv_discord_nullweek_idx" ON "profile_votes" ("profile_user_id","voter_discord_id") WHERE "voter_discord_id" IS NOT NULL AND "week_key" IS NULL`,
  `CREATE INDEX IF NOT EXISTS "pv_week_idx" ON "profile_votes" ("week_key","profile_user_id")`,
  `CREATE TABLE IF NOT EXISTS "vote_week_actions" (
    "id" text PRIMARY KEY NOT NULL,
    "week_key" text NOT NULL,
    "profile_user_id" text NOT NULL,
    "action" text NOT NULL,
    "delta" integer NOT NULL DEFAULT 0,
    "reason" text NOT NULL DEFAULT '',
    "actor_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "vwa_week_idx" ON "vote_week_actions" ("week_key","profile_user_id")`,
  `CREATE TABLE IF NOT EXISTS "vote_weeks" (
    "week_key" text PRIMARY KEY NOT NULL,
    "podium" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "stream_url" text,
    "stream_live" boolean NOT NULL DEFAULT false,
    "announced_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "portal_login_attempts" (
    "id" text PRIMARY KEY NOT NULL,
    "kind" text NOT NULL,
    "portal_id" text NOT NULL,
    "portal_name" text,
    "ok" boolean NOT NULL DEFAULT false,
    "hashed_ip" text,
    "user_agent" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "pla_portal_idx" ON "portal_login_attempts" ("kind","portal_id","created_at")`,
  `CREATE TABLE IF NOT EXISTS "profile_views" (
    "id" text PRIMARY KEY NOT NULL,
    "profile_user_id" text NOT NULL,
    "source" text NOT NULL DEFAULT 'web',
    "guild_id" text,
    "guild_name" text,
    "viewer_user_id" text,
    "viewer_discord_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "pvw_profile_idx" ON "profile_views" ("profile_user_id","created_at")`,
  `CREATE TABLE IF NOT EXISTS "brand_enquiries" (
    "id" text PRIMARY KEY NOT NULL,
    "company" text NOT NULL,
    "contact_name" text NOT NULL DEFAULT '',
    "email" text NOT NULL,
    "phone" text,
    "website" text,
    "message" text NOT NULL DEFAULT '',
    "tier" text NOT NULL DEFAULT 'reach',
    "games" integer NOT NULL DEFAULT 0,
    "addon" boolean NOT NULL DEFAULT false,
    "billing" text NOT NULL DEFAULT 'monthly',
    "quoted_monthly" integer NOT NULL DEFAULT 0,
    "status" text NOT NULL DEFAULT 'new',
    "note" text,
    "brand_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "benq_status_idx" ON "brand_enquiries" ("status","created_at")`,

  // ===== Data room: investor + partner documents =====
  `CREATE TABLE IF NOT EXISTS "dataroom_docs" (
    "id" text PRIMARY KEY NOT NULL,
    "slug" text NOT NULL UNIQUE,
    "kind" text NOT NULL DEFAULT 'deck',
    "title" text NOT NULL,
    "subtitle" text,
    "summary" text,
    "cover_url" text,
    "accent" text NOT NULL DEFAULT '#8b5cf6',
    "accent2" text NOT NULL DEFAULT '#22d3ee',
    "access_key" text,
    "is_published" boolean NOT NULL DEFAULT true,
    "contact_email" text,
    "contact_note" text,
    "sort_order" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "dataroom_sections" (
    "id" text PRIMARY KEY NOT NULL,
    "doc_id" text NOT NULL,
    "kind" text NOT NULL,
    "anchor" text NOT NULL,
    "nav_label" text NOT NULL,
    "title" text,
    "subtitle" text,
    "body" text,
    "bg_url" text,
    "dim" integer NOT NULL DEFAULT 62,
    "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "sort_order" integer NOT NULL DEFAULT 0,
    "is_visible" boolean NOT NULL DEFAULT true
  )`,
  `CREATE INDEX IF NOT EXISTS "droom_section_idx" ON "dataroom_sections" ("doc_id","sort_order")`,
  `CREATE TABLE IF NOT EXISTS "dataroom_people" (
    "id" text PRIMARY KEY NOT NULL,
    "doc_id" text,
    "name" text NOT NULL,
    "role" text NOT NULL,
    "bio" text,
    "avatar_url" text,
    "email" text,
    "linkedin" text,
    "x" text,
    "logos" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "sort_order" integer NOT NULL DEFAULT 0,
    "is_visible" boolean NOT NULL DEFAULT true
  )`,
  `CREATE TABLE IF NOT EXISTS "dataroom_views" (
    "id" text PRIMARY KEY NOT NULL,
    "doc_id" text NOT NULL,
    "section_anchor" text,
    "visitor_id" text,
    "referrer" text,
    "country" text,
    "device" text,
    "seconds" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "droom_view_idx" ON "dataroom_views" ("doc_id","created_at")`,

  // ----- Trophy marketplace -----
  `ALTER TABLE "trophies" ADD COLUMN IF NOT EXISTS "cp_price" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "trophies" ADD COLUMN IF NOT EXISTS "in_marketplace" boolean NOT NULL DEFAULT true`,
  `ALTER TABLE "trophies" ADD COLUMN IF NOT EXISTS "title" text`,
  `ALTER TABLE "trophies" ADD COLUMN IF NOT EXISTS "description" text`,
  `ALTER TABLE "trophy_redeems" ADD COLUMN IF NOT EXISTS "failed_reason" text`,
  `CREATE TABLE IF NOT EXISTS "marketplace_orders" (
    "id" text PRIMARY KEY NOT NULL,
    "buyer_id" text NOT NULL,
    "recipient_id" text NOT NULL,
    "trophy_id" text NOT NULL,
    "award_id" text,
    "cp_spent" integer NOT NULL,
    "value" double precision NOT NULL DEFAULT 0,
    "kind" text NOT NULL DEFAULT 'self',
    "message" text,
    "status" text NOT NULL DEFAULT 'complete',
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "mo_buyer_idx" ON "marketplace_orders" ("buyer_id","created_at")`,
  `CREATE INDEX IF NOT EXISTS "mo_recipient_idx" ON "marketplace_orders" ("recipient_id")`,

  // ----- One game account, one gamer -----
  //
  // `linked_game_accounts` was unique on (user_id, provider, account_id), which
  // is unique PER USER: two gamers could hold the same Riot account and both be
  // paid for the same week of play. Uniqueness now spans the platform.
  `ALTER TABLE "linked_game_accounts" ADD COLUMN IF NOT EXISTS "verified_method" text NOT NULL DEFAULT 'claimed'`,
  `ALTER TABLE "linked_game_accounts" ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone`,
  `ALTER TABLE "linked_game_accounts" ADD COLUMN IF NOT EXISTS "proof_challenge" jsonb`,
  `ALTER TABLE "linked_game_accounts" ADD COLUMN IF NOT EXISTS "proof_expires_at" timestamp with time zone`,
  `ALTER TABLE "linked_game_accounts" ADD COLUMN IF NOT EXISTS "ownership_status" text NOT NULL DEFAULT 'ok'`,

  // Mobile Legends already had the strongest proof on the platform: a code
  // Moonton delivers into the game, which only the account holder can read.
  // Those links keep their tick, correctly labelled.
  `UPDATE "linked_game_accounts" SET "verified_method" = 'vc', "verified_at" = COALESCE("verified_at", "created_at")
     WHERE "verified_method" = 'claimed' AND "provider" = 'mobile-legends'`,
  // Every other pre-existing row was marked verified the moment the provider's
  // API answered — which proved the account EXISTS, not that the person owns
  // it. The tick is withdrawn and the truth recorded; owners re-earn it in
  // seconds through the proof their game supports.
  `UPDATE "linked_game_accounts" SET "verified" = false, "verified_method" = 'exists'
     WHERE "verified_method" = 'claimed'`,

  // Collisions that already exist are MARKED, never deleted — a deleted account
  // cascades its stats, its challenge entries and its standings, and a season of
  // prize-money history is not something to discard to make an index build. The
  // earliest claim keeps the account; the rest are flagged for staff.
  `UPDATE "linked_game_accounts" a SET "ownership_status" = 'disputed', "verified" = false
     WHERE a."ownership_status" = 'ok' AND EXISTS (
       SELECT 1 FROM "linked_game_accounts" b
        WHERE b."provider" = a."provider"
          AND b."provider_account_id" = a."provider_account_id"
          AND b."user_id" <> a."user_id"
          AND (b."created_at" < a."created_at" OR (b."created_at" = a."created_at" AND b."id" < a."id"))
     )`,
  // Partial, so the disputed rows above can't stop it building. Going forward
  // no two live claims can share one account, whatever code path tries.
  `CREATE UNIQUE INDEX IF NOT EXISTS "lga_provider_acct_unique_idx"
     ON "linked_game_accounts" ("provider","provider_account_id") WHERE "ownership_status" = 'ok'`,

  // ----- Money: billing, payouts, and getting payment details OUT of here -----
  //
  // Read the block comment above `payoutAccounts` in schema.ts first. The short
  // version: Cluster stores a preference and an opaque provider handle, and
  // nothing else. Everything that can move money lives with the provider.
  `CREATE TABLE IF NOT EXISTS "payout_accounts" (
    "id" text PRIMARY KEY NOT NULL,
    "owner_type" text NOT NULL,
    "owner_id" text NOT NULL,
    "provider_key" text NOT NULL DEFAULT 'manual',
    "provider_recipient_id" text,
    "method_preference" text,
    "country" text,
    "currency" text NOT NULL DEFAULT 'USD',
    "status" text NOT NULL DEFAULT 'none',
    "note" text,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "payout_acct_owner_idx" ON "payout_accounts" ("owner_type","owner_id")`,

  `CREATE TABLE IF NOT EXISTS "brand_invoices" (
    "id" text PRIMARY KEY NOT NULL,
    "brand_id" text NOT NULL,
    "number" text NOT NULL,
    "status" text NOT NULL DEFAULT 'draft',
    "currency" text NOT NULL DEFAULT 'USD',
    "period_label" text,
    "issued_at" timestamp with time zone,
    "due_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "notes" text,
    "pay_link_url" text,
    "pay_provider" text,
    "pay_ref" text,
    "pay_embeddable" boolean NOT NULL DEFAULT false,
    "paid_via" text,
    "paid_ref" text,
    "pay_token" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "brand_invoice_number_idx" ON "brand_invoices" ("number")`,
  `CREATE INDEX IF NOT EXISTS "brand_invoice_brand_idx" ON "brand_invoices" ("brand_id","created_at")`,

  `CREATE TABLE IF NOT EXISTS "invoice_lines" (
    "id" text PRIMARY KEY NOT NULL,
    "invoice_id" text NOT NULL,
    "kind" text NOT NULL DEFAULT 'adjustment',
    "label" text NOT NULL,
    "quantity" double precision NOT NULL DEFAULT 1,
    "unit_amount" double precision NOT NULL DEFAULT 0,
    "source_type" text,
    "source_id" text,
    "sort_order" integer NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS "invoice_line_inv_idx" ON "invoice_lines" ("invoice_id","sort_order")`,

  `CREATE TABLE IF NOT EXISTS "server_payouts" (
    "id" text PRIMARY KEY NOT NULL,
    "guild_id" text NOT NULL,
    "guild_name" text,
    "status" text NOT NULL DEFAULT 'draft',
    "currency" text NOT NULL DEFAULT 'USD',
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone,
    "provider_key" text,
    "provider_ref" text,
    "collect_url" text,
    "note" text,
    "requested_by" text,
    "requested_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "failed_reason" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "server_payout_guild_idx" ON "server_payouts" ("guild_id","created_at")`,

  `CREATE TABLE IF NOT EXISTS "server_payout_lines" (
    "id" text PRIMARY KEY NOT NULL,
    "payout_id" text NOT NULL,
    "kind" text NOT NULL DEFAULT 'sponsored_share',
    "label" text NOT NULL,
    "challenge_id" text,
    "amount" double precision NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS "server_payout_line_idx" ON "server_payout_lines" ("payout_id")`,

  // Where we reach a server owner (B47). Required for the profile to count as
  // complete, and therefore for the revenue share to pay out.
  `ALTER TABLE "discord_guilds" ADD COLUMN IF NOT EXISTS "contact_email" text`,
  `ALTER TABLE "discord_guilds" ADD COLUMN IF NOT EXISTS "tier_unlocked_at" timestamptz`,
  // Who brought us this server (B22). The gamer who clicked "add the bot" and
  // completed the install, when there was a signed-in one — null when the
  // install came from Discord's own App Directory button or from somebody with
  // no Cluster account, which is the common case and not a failure.
  `ALTER TABLE "discord_guilds" ADD COLUMN IF NOT EXISTS "installed_by_user_id" text`,

  // The email delivery log (B32). A row per attempt, including the ones skipped
  // because mail is not configured — "we never sent it" is an answer a human
  // needs, and a layer that silently does nothing when switched off teaches you
  // to trust it exactly when it is doing the least.
  `CREATE TABLE IF NOT EXISTS "email_log" (
    "id" text PRIMARY KEY NOT NULL,
    "to_address" text NOT NULL,
    "template" text NOT NULL,
    "subject" text NOT NULL,
    "provider_id" text,
    "status" text DEFAULT 'queued' NOT NULL,
    "error" text,
    "ref_type" text,
    "ref_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "email_log_created_idx" ON "email_log" ("created_at")`,
  `CREATE INDEX IF NOT EXISTS "email_log_status_idx" ON "email_log" ("status")`,

  // Feature screenshots (B7). One row per component worth proving; every page
  // claiming that component reads the same row, so one admin edit updates the
  // picture everywhere it appears. The caption and alt text live here too — an
  // admin who can swap the picture but not the sentence under it can only
  // half-fix a stale claim.
  `CREATE TABLE IF NOT EXISTS "feature_shots" (
    "key" text PRIMARY KEY NOT NULL,
    "image_url" text,
    "alt_text" text DEFAULT '' NOT NULL,
    "caption" text DEFAULT '' NOT NULL,
    "claim" text DEFAULT '' NOT NULL,
    "overlay" jsonb DEFAULT '{}'::jsonb,
    "captured_from" text,
    "captured_at" timestamp with time zone,
    "width" integer,
    "height" integer,
    "updated_by" text,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,

  `ALTER TABLE "trophy_redeems" ADD COLUMN IF NOT EXISTS "provider_key" text`,
  `ALTER TABLE "trophy_redeems" ADD COLUMN IF NOT EXISTS "provider_ref" text`,
  `ALTER TABLE "trophy_redeems" ADD COLUMN IF NOT EXISTS "collect_url" text`,
  `ALTER TABLE "trophy_redeems" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone`,

  // ===== The deletion =====
  //
  // Every routing number, account number and mobile wallet number a gamer ever
  // typed into the old redeem form is erased here, permanently, on the next
  // boot. Nothing reads these columns any more and nothing writes them.
  //
  // This is destructive and it is meant to be. Holding a few thousand gamers'
  // bank details to save a support ticket is a trade nobody should take, and
  // the replacement is better anyway: the gamer chooses where the money goes on
  // the provider's own page, every time, and we never see it.
  //
  // The method WORD survives, remapped to the vocabulary the new flow uses, so
  // a gamer who already told us "pay me by bank transfer" is not asked again.
  `UPDATE "trophy_redeems" SET "details" = '{}'::jsonb WHERE "details" <> '{}'::jsonb`,
  `UPDATE "trophy_redeems" SET "method" = 'bank' WHERE "method" IN ('ach','instapay')`,
  `UPDATE "trophy_redeems" SET "method" = 'wallet' WHERE "method" NOT IN ('bank','paypal','wallet','giftcard','other')`,
  `UPDATE "users" SET "payout_method" = "payout_method" - 'details'
     WHERE "payout_method" IS NOT NULL AND "payout_method" ? 'details'`,
  `UPDATE "users" SET "payout_method" = jsonb_set("payout_method", '{method}', '"bank"')
     WHERE "payout_method" IS NOT NULL AND "payout_method"->>'method' IN ('ach','instapay')`,
];

async function runColumnMigrations(db: DB) {
  for (const stmt of COLUMN_MIGRATIONS) {
    try { await db.execute(dsql.raw(stmt)); }
    catch (e) {
      if (!/already exists|does not exist/i.test(String(e))) throw e;
      // Say which one was skipped, and why.
      //
      // Most of these are expected — an ALTER against a table a later statement
      // creates, run again on the next boot. But the swallow used to be
      // completely silent, and a CREATE TABLE that quietly failed left a table
      // missing with no trace anywhere: every query against it errored at
      // request time, far away from the cause, and the migration list looked
      // fine because it always looks fine. One line of warning is the
      // difference between a five-minute diagnosis and an afternoon.
      console.warn(`[migrate] skipped: ${stmt.slice(0, 70).replace(/\s+/g, " ")}… — ${String(e).slice(0, 120)}`);
    }
  }
}

async function ensureProvisioned(db: DB) {
  const existing = await db.execute(dsql`SELECT to_regclass('public.users') AS t`);
  if (rowsOf(existing).some((r) => r.t)) {
    // Schema already exists — back-fill any columns added since, then run the
    // once-per-version maintenance (house ads, planet skins, image→Blob). The
    // maintenance gate is a single tiny read, so steady-state boots do no
    // table scans — this is what keeps Neon data-transfer from ballooning.
    await runColumnMigrations(db);
    try {
      const { runBootMaintenance, migrateGameImagesToBlob, ensureTopBannerAd, ensureCardAdPlacement, ensureBlogAdPlacements, refreshStaleChallengeWindows, ensureBrandKeys, rehostImagesToBlob } = await import("./seed");
      await runBootMaintenance(db);
      // Runs EVERY boot (not version-gated): converts any images still stored as
      // base64 data URLs to Blob. Cheap once done (SQL LIKE 'data:%' → 0 rows),
      // and self-healing if an earlier boot failed (e.g. Blob was private then).
      await migrateGameImagesToBlob(db);
      // Move inline base64 (the real Neon-transfer culprit — a 2MB theme.bgImage)
      // and Higgsfield/cloudfront art into our own Blob. Idempotent + cheap once done.
      await rehostImagesToBlob(db);
      await ensureTopBannerAd(db);
      await ensureCardAdPlacement(db);
      await ensureBlogAdPlacements(db);
      await refreshStaleChallengeWindows(db);
      await ensureBrandKeys(db);
    } catch { /* non-fatal — ads/skins just won't backfill this boot */ }
    return;
  }
  
  const { DDL_STATEMENTS } = await import("./ddl");
  for (const statement of DDL_STATEMENTS) {
    try {
      await db.execute(dsql.raw(statement));
    } catch (e) {
      // Two cold lambdas can race the bootstrap — "already exists" is fine.
      if (!/already exists/i.test(String(e))) throw e;
    }
  }
  await runColumnMigrations(db);
  const { seed, runBootMaintenance, migrateGameImagesToBlob, ensureTopBannerAd, ensureCardAdPlacement, ensureBlogAdPlacements, refreshStaleChallengeWindows, ensureBrandKeys, rehostImagesToBlob } = await import("./seed");
  try {
    await seed(db, { demo: false });
  } catch (e) {
    if (!/duplicate key|already exists/i.test(String(e))) throw e;
  }
  try { await runBootMaintenance(db); await migrateGameImagesToBlob(db); await rehostImagesToBlob(db); await ensureTopBannerAd(db); await ensureCardAdPlacement(db); await ensureBlogAdPlacements(db); await refreshStaleChallengeWindows(db); await ensureBrandKeys(db); } catch { /* non-fatal */ }
}

async function createDb(): Promise<DB> {
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const client = neon(process.env.DATABASE_URL);
    // B55.8: query counting, off unless PERF_COUNT=1.
    const { perfLogger, perfEnabled } = await import("./perf");
    const db = drizzle(client, { schema, ...(perfEnabled() ? { logger: perfLogger } : {}) }) as DB;
    await ensureProvisioned(db);
    return db;
  }
  // Demo mode: in-memory Postgres (PGlite). Fully functional; resets on cold start.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  const { perfLogger, perfEnabled } = await import("./perf");
  const db = drizzle(client, { schema, ...(perfEnabled() ? { logger: perfLogger } : {}) }) as DB;
  const { DDL } = await import("./ddl");
  await client.exec(DDL);
  // Apply the same idempotent column back-fills so demo mode matches the schema
  // without hand-editing the static DDL for every new column.
  await runColumnMigrations(db);
  const { seed, runBootMaintenance, ensureBrandKeys, ensureBlogAdPlacements } = await import("./seed");
  await seed(db, { demo: true });
  // Demo mode must run the same boot maintenance as production (planet skins,
  // logos/covers, house ads) so globes + connect art show here too.
  try { await runBootMaintenance(db); await ensureBlogAdPlacements(db); await ensureBrandKeys(db); } catch { /* non-fatal */ }

  // The demo ACTIVITY layer runs LAST — after boot maintenance, not inside
  // `seed()`.
  //
  // It has to. Cluster Points are awarded through `awardQuestAction`, which
  // credits every ACTIVE QUEST listening to an action — and the quests
  // themselves are created by `seedQuests`, which `runBootMaintenance` calls.
  // Run from inside `seed()` this happened before any quest existed, so every
  // award found nothing to credit and returned silently (that path swallows its
  // own errors by design, because gamification must never block the action that
  // triggered it). The result was a demo where votes, ads, invoices and payouts
  // all seeded correctly and the CP totals were quietly zero.
  try {
    const { seedDemoActivity } = await import("./seed-activity");
    await seedDemoActivity(db);
  } catch (e) { console.warn("[seed] demo activity layer failed:", e); }
  return db;
}

export function getDb(): Promise<DB> {
  if (!globalThis.__clusterDb) {
    globalThis.__clusterDb = createDb().catch((e) => {
      // Don't cache a failed bootstrap — let the next request retry.
      globalThis.__clusterDb = undefined;
      throw e;
    });
  }
  return globalThis.__clusterDb;
}

export { schema };
