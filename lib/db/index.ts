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
  `ALTER TABLE "quest_tiers" ADD COLUMN IF NOT EXISTS "map_x" integer NOT NULL DEFAULT 50`,
  `ALTER TABLE "quest_tiers" ADD COLUMN IF NOT EXISTS "map_y" integer NOT NULL DEFAULT 50`,
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
      const { runBootMaintenance, migrateGameImagesToBlob, ensureTopBannerAd, refreshStaleChallengeWindows } = await import("./seed");
      await runBootMaintenance(db);
      // Runs EVERY boot (not version-gated): converts any images still stored as
      // base64 data URLs to Blob. Cheap once done (SQL LIKE 'data:%' → 0 rows),
      // and self-healing if an earlier boot failed (e.g. Blob was private then).
      await migrateGameImagesToBlob(db);
      await ensureTopBannerAd(db);
      await refreshStaleChallengeWindows(db);
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
  const { seed, runBootMaintenance, migrateGameImagesToBlob, ensureTopBannerAd, refreshStaleChallengeWindows } = await import("./seed");
  try {
    await seed(db, { demo: false });
  } catch (e) {
    if (!/duplicate key|already exists/i.test(String(e))) throw e;
  }
  try { await runBootMaintenance(db); await migrateGameImagesToBlob(db); await ensureTopBannerAd(db); await refreshStaleChallengeWindows(db); } catch { /* non-fatal */ }
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
  const { seed } = await import("./seed");
  await seed(db, { demo: true });
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
