// The schema grows one stage at a time. What is here is what a stage has
// actually needed; nothing is declared ahead of the code that uses it.
//
// Three laws from docs/07-DATA-MODEL.md govern every table added below:
//
//   1. No stored balances. Ever. A balance is `sum(ledger)`.
//   2. No payment details. Ever. A preference word and an opaque provider
//      handle. Nothing account-shaped.
//   3. Append-only where money moves. A correction is a new row.
//
// Law 2 is enforced by a test that walks this file, not by memory.

import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * A gamer.
 *
 * `email` is null until redemption — it is deliberately not asked at
 * onboarding (docs/00-TRUTH.md G2). `ageBand` is set once and is never
 * self-editable afterwards (U2); under-13 is not a value, because that path
 * deletes the account (U3).
 *
 * Stage 0 declares only what `lib/db/tx.ts` locks and what Stage 1 will fill
 * in. Columns arrive with the stage that reads them.
 */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    // `teen` | `adult`. Null until onboarding sets it.
    ageBand: text("age_band"),
    country: text("country"),
    discordId: text("discord_id").unique(),
    // The server that brought them. Attribution rule G3.
    attributedGuildId: text("attributed_guild_id"),
    // `active` | `deleted`.
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("users_status_idx").on(t.status)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * One game account, belonging to exactly one gamer.
 *
 * L1: unique on `(provider, providerAccountId)` across all users. L2 is why
 * that uniqueness is not simply a rejection — a gamer who *proves* ownership
 * takes the account from one who only claimed it, otherwise typing somebody
 * else's name first is a denial of service.
 *
 * L3 is the distinction the whole ownership model rests on and it is easy to
 * lose: `verified: true` with `verifiedMethod: "exists"` means *the account
 * exists*. It does not mean this person owns it. Only `icon`, `oauth`,
 * `openid` and `admin` are proof, and only they may be described as verified
 * anywhere a human reads (content rule C5).
 */
export const linkedGameAccounts = pgTable(
  "linked_game_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    inGameName: text("in_game_name"),
    region: text("region"),
    // True once the account resolved at all. Not a claim of ownership — see
    // `verifiedMethod`, and `isProven()` in lib/identity/accounts.ts.
    verified: boolean("verified").notNull().default(false),
    // `claimed` | `exists` | `icon` | `oauth` | `openid` | `admin`
    verifiedMethod: text("verified_method").notNull().default("claimed"),
    // `ok` | `error` | `needs_reconnect` | `needs_key` | `rate_limited`
    syncStatus: text("sync_status").notNull().default("ok"),
    syncError: text("sync_error"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    // When this account is next due. Null means "never synced" and sorts
    // first: a never-synced account belongs to somebody staring at an empty
    // profile right now.
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true }),
    // Provider-specific extras: a profile icon, champion mastery, an
    // encrypted MLBB session token. Never a payment detail — the structural
    // test walks column names, and this column exists precisely because
    // per-provider junk must have one home rather than sprouting columns.
    providerData: jsonb("provider_data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("linked_provider_account_idx").on(t.provider, t.providerAccountId),
    index("linked_user_idx").on(t.userId),
  ],
);

export type LinkedGameAccount = typeof linkedGameAccounts.$inferSelect;

/**
 * People who answered "under 13", by salted hash.
 *
 * U3: under-13 is not an age band. That path deletes the account outright. But
 * a deletion alone teaches the lesson "answer differently next time", so the
 * hash survives the row: the same Discord ID cannot come back and pick a
 * different answer.
 *
 * The hash is salted and one-way on purpose. This table must be able to say
 * "we have seen this person" and must never be able to say who they were —
 * it exists to protect a child, not to build a list of children.
 */
export const blockedRegistrations = pgTable(
  "blocked_registrations",
  {
    // The salted hash IS the key. There is no id, because there is nothing to
    // join to: the account it refers to was deleted.
    hash: text("hash").primaryKey(),
    // `under_13`. A word, not free text — this table has one reason to exist.
    reason: text("reason").notNull(),
    blockedAt: timestamp("blocked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("blocked_reason_idx").on(t.reason)],
);

/**
 * Sessions.
 *
 * The cookie carries a signed session id and nothing else — no role, no age
 * band, no unlock state. Everything a request needs is read from the database
 * behind that id, because a cookie is a claim the holder can keep making after
 * the fact stops being true. A gamer whose age band was corrected by support
 * must not keep an 18+ cookie until it expires.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/**
 * Every stat reading we have ever taken. The raw material for every delta.
 *
 * O1 — **append-only.** There is no "current value" column anywhere, and that
 * is the same rule as the vault: a current value is `the latest row`, and a
 * stored one cannot be reconstructed once it disagrees with the series.
 *
 * O2 — **a decrease means a season reset, not a bad week.** Riot zeroes `wins`
 * at a split. Clamping the delta at zero would look correct and would silently
 * cost every League player their entire week, every split, forever. The
 * decrease is detected here, in the series, and re-baselines instead — see
 * `lib/core/sync.ts`.
 */
export const observations = pgTable(
  "observations",
  {
    id: text("id").primaryKey(),
    linkedAccountId: text("linked_account_id").notNull(),
    provider: text("provider").notNull(),
    metricKey: text("metric_key").notNull(),
    value: integer("value").notNull(),
    // The game's own name for the value, when it has one: "Gold II". Stored
    // beside the number because a ladder position without its label is a
    // number nobody can read back.
    rankLabel: text("rank_label"),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("observations_account_metric_idx").on(
      t.linkedAccountId,
      t.metricKey,
      t.observedAt,
    ),
  ],
);

export type Observation = typeof observations.$inferSelect;

/**
 * A re-baseline forced by a season reset.
 *
 * Kept as rows rather than handled silently because it moves every score in
 * every live challenge on that account. When a gamer asks why their points
 * changed on a Tuesday, this table is the answer.
 */
export const seasonResets = pgTable(
  "season_resets",
  {
    id: text("id").primaryKey(),
    linkedAccountId: text("linked_account_id").notNull(),
    metricKey: text("metric_key").notNull(),
    previousValue: integer("previous_value").notNull(),
    newValue: integer("new_value").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("season_resets_account_idx").on(t.linkedAccountId)],
);
