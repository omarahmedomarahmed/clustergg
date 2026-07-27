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
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'public'`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "guild_id" text`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "access_key" text`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "announce_hype" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "guild_ids" jsonb NOT NULL DEFAULT '[]'::jsonb`,
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
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "vote_count" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "discord_views" integer NOT NULL DEFAULT 0`,
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
];

async function runColumnMigrations(db: DB) {
  for (const stmt of COLUMN_MIGRATIONS) {
    try { await db.execute(dsql.raw(stmt)); }
    catch (e) { if (!/already exists|does not exist/i.test(String(e))) throw e; }
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
      const { runBootMaintenance, migrateGameImagesToBlob, ensureTopBannerAd, refreshStaleChallengeWindows, ensureBrandKeys, rehostImagesToBlob } = await import("./seed");
      await runBootMaintenance(db);
      // Runs EVERY boot (not version-gated): converts any images still stored as
      // base64 data URLs to Blob. Cheap once done (SQL LIKE 'data:%' → 0 rows),
      // and self-healing if an earlier boot failed (e.g. Blob was private then).
      await migrateGameImagesToBlob(db);
      // Move inline base64 (the real Neon-transfer culprit — a 2MB theme.bgImage)
      // and Higgsfield/cloudfront art into our own Blob. Idempotent + cheap once done.
      await rehostImagesToBlob(db);
      await ensureTopBannerAd(db);
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
  const { seed, runBootMaintenance, migrateGameImagesToBlob, ensureTopBannerAd, refreshStaleChallengeWindows, ensureBrandKeys, rehostImagesToBlob } = await import("./seed");
  try {
    await seed(db, { demo: false });
  } catch (e) {
    if (!/duplicate key|already exists/i.test(String(e))) throw e;
  }
  try { await runBootMaintenance(db); await migrateGameImagesToBlob(db); await rehostImagesToBlob(db); await ensureTopBannerAd(db); await refreshStaleChallengeWindows(db); await ensureBrandKeys(db); } catch { /* non-fatal */ }
}

async function createDb(): Promise<DB> {
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const client = neon(process.env.DATABASE_URL);
    const db = drizzle(client, { schema }) as DB;
    await ensureProvisioned(db);
    return db;
  }
  // Demo mode: in-memory Postgres (PGlite). Fully functional; resets on cold start.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  const db = drizzle(client, { schema }) as DB;
  const { DDL } = await import("./ddl");
  await client.exec(DDL);
  // Apply the same idempotent column back-fills so demo mode matches the schema
  // without hand-editing the static DDL for every new column.
  await runColumnMigrations(db);
  const { seed, runBootMaintenance, ensureBrandKeys } = await import("./seed");
  await seed(db, { demo: true });
  // Demo mode must run the same boot maintenance as production (planet skins,
  // logos/covers, house ads) so globes + connect art show here too.
  try { await runBootMaintenance(db); await ensureBrandKeys(db); } catch { /* non-fatal */ }
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
