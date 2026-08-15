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

// ============================================================================
// Money
// ============================================================================

/**
 * Every movement of every dollar. Append-only.
 *
 * M1 — **never updated, never deleted.** A correction is a new row with the
 * opposite sign and a reason. That is not bureaucracy: a ledger you can edit
 * cannot answer "what did we think last Tuesday", and every reconciliation
 * question is a question about the past.
 *
 * M2 — **every balance is `sum(amount)` filtered by vault.** There is no
 * balance column here or anywhere else. A stored balance cannot be
 * reconstructed once it goes wrong, and eventually every one of them does.
 *
 * `amount` is signed whole cents. Money in is positive, money out is negative,
 * and a split is three rows out of income plus three rows into the vaults, so
 * the whole system sums to zero at all times and any drift is visible.
 */
export const vaultLedger = pgTable(
  "vault_ledger",
  {
    id: text("id").primaryKey(),
    // `income` | `prize` | `server` | `cluster`
    vault: text("vault").notNull(),
    amount: integer("amount").notNull(),
    // `challenge_sale` · `split` · `trophy_award` · `redemption` ·
    // `pool_allocation` · `payout` · `sweep` · `refund`
    kind: text("kind").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    // Who and why. Never null in practice — a row nobody can explain is a row
    // nobody can reverse.
    reason: text("reason").notNull(),
    actorId: text("actor_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ledger_vault_idx").on(t.vault),
    index("ledger_ref_idx").on(t.refType, t.refId),
  ],
);

export type VaultLedgerRow = typeof vaultLedger.$inferSelect;

/**
 * A bill. I1: a total is its lines, recomputed — never a stored number.
 *
 * I2: overdue is **derived** from `dueAt`, never a flag. A flag needs a job to
 * flip it, the job is the thing that breaks, and an invoice that is overdue in
 * reality and not-overdue in the database is how a challenge announces unpaid.
 *
 * I3: `paidAt` is the **only** trigger for vault routing. M6 — money enters a
 * vault when the invoice is paid, never when it is issued.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    // `brand` | `guild` | `house`
    payerType: text("payer_type").notNull(),
    payerId: text("payer_id"),
    // `draft` | `issued` | `paid` | `void`
    status: text("status").notNull().default("draft"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    // The payment provider's own reference. An opaque handle and nothing else
    // — house rule 5. Never a card, never a last four.
    providerRef: text("provider_ref"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("invoices_status_idx").on(t.status)],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    // What this line bought, so a paid invoice can find its challenges.
    refType: text("ref_type"),
    refId: text("ref_id"),
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId)],
);

/**
 * A deliberate move of money from vault 3 into a week's pool.
 *
 * A1 — `allocation ≤ serverVault ÷ 2`, refused above with the reason.
 * A2 — an allocation can be **raised, never lowered**: people were shown the
 * number. A server owner who saw "$21 so far" on Wednesday and $14 on Friday
 * has been told a lie, whichever number was right.
 */
export const poolAllocations = pgTable(
  "pool_allocations",
  {
    id: text("id").primaryKey(),
    // The Monday 00:00 UTC that opens the week this pool belongs to.
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    actorId: text("actor_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("pool_week_idx").on(t.weekStart)],
);

/**
 * What a server is owed for a week.
 *
 * A3 — payouts open as **drafts**. The weekly close computes; a human
 * releases. A job that moved money on its own is one nobody could stop on a
 * Sunday.
 */
export const serverPayouts = pgTable(
  "server_payouts",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    // `draft` | `released` | `paid` | `cancelled`
    status: text("status").notNull().default("draft"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releasedBy: text("released_by"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("payout_guild_week_idx").on(t.guildId, t.weekStart)],
);

/** A4 — a payout's total is its lines. Flat share and scored share, separately. */
export const payoutLines = pgTable(
  "payout_lines",
  {
    id: text("id").primaryKey(),
    payoutId: text("payout_id").notNull(),
    // `flat` | `scored`
    kind: text("kind").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [index("payout_lines_payout_idx").on(t.payoutId)],
);

/** Operator knobs. The vault split lives here; the code holds the default. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

/** Every admin action that touches money or access. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    detail: jsonb("detail"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_action_idx").on(t.action)],
);

/**
 * A trophy definition. `user_trophies` is one gamer holding one.
 *
 * Declared at Stage 3 rather than Stage 5 because the prize vault reads them:
 * the vault's balance is defined as the sum of unredeemed money-trophies, so
 * the liability side of the invariant cannot exist without these two tables.
 * Stage 5 builds the features — templates, milestones, the pool guard,
 * redemption. This is the shape they need.
 *
 * T1 — `valueCents` is **immutable after creation**. A $100 trophy is a $100
 * trophy forever (V5). Editing a value would silently change a liability
 * already backed by money in the vault, and the gamer holding it was told a
 * number.
 *
 * T2 — a `valueCents` of 0 is a **collectable**: unredeemable, enforced at the
 * redeem action, and nothing to do with the prize vault at all (V8).
 */
export const trophies = pgTable(
  "trophies",
  {
    id: text("id").primaryKey(),
    // `podium` | `participation` | `milestone`
    type: text("type").notNull(),
    name: text("name").notNull(),
    // Editable, and an edit propagates to every holder everywhere (T8/V6).
    imageUrl: text("image_url"),
    // Immutable. Whole cents, and 0 for participation and milestone.
    valueCents: integer("value_cents").notNull().default(0),
    brandId: text("brand_id"),
    challengeId: text("challenge_id"),
    place: integer("place"),
    milestoneKind: text("milestone_kind"),
    milestoneGame: text("milestone_game"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trophies_challenge_idx").on(t.challengeId),
    index("trophies_type_idx").on(t.type),
  ],
);

export type Trophy = typeof trophies.$inferSelect;

/**
 * One gamer holding one trophy.
 *
 * T4 — unique on `(challengeId, userId, place)` via the trophy, so a duplicate
 * award is impossible rather than merely unlikely.
 *
 * T6 — a holding **survives its holder's deletion** as an orphan. That looks
 * like a bug and is the opposite: the money was real, it was paid by a brand,
 * and dropping the row would silently break the vault invariant by removing a
 * liability while leaving its funding in place.
 */
export const userTrophies = pgTable(
  "user_trophies",
  {
    id: text("id").primaryKey(),
    trophyId: text("trophy_id").notNull(),
    userId: text("user_id").notNull(),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    // Set when a five-year hold expires or an orphan is swept to Cluster.
    // V12 — a sweep is reversible, which is why this is a nullable timestamp
    // and not a deletion.
    sweptAt: timestamp("swept_at", { withTimezone: true }),
    sweptReason: text("swept_reason"),
  },
  (t) => [
    uniqueIndex("user_trophy_unique_idx").on(t.trophyId, t.userId),
    index("user_trophies_user_idx").on(t.userId),
  ],
);

export type UserTrophy = typeof userTrophies.$inferSelect;

// ============================================================================
// Servers and challenges
// ============================================================================

/**
 * A Discord server that has the bot.
 *
 * S5 — **`adminRoleId` is the role ID, never the name.** A renamed role must
 * not silently revoke a portal key, and it would: names are what people
 * change, ids are what Discord keys on.
 *
 * K7 / G-rule — a server that never described itself is **dropped from pool
 * scoring**, not scored zero. Scored zero it would still occupy a percentile
 * position and take money from servers that did the work.
 */
export const guilds = pgTable(
  "guilds",
  {
    guildId: text("guild_id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    memberCount: integer("member_count").notNull().default(0),
    adminRoleId: text("admin_role_id"),
    announceChannelId: text("announce_channel_id"),
    // The community profile. Null means never described — dropped from scoring.
    community: text("community"),
    portalKeyHash: text("portal_key_hash"),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
    // Removal freezes reach; earnings survive (S9).
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [index("guilds_removed_idx").on(t.removedAt)],
);

export type Guild = typeof guilds.$inferSelect;

/** Weekly member and linked counts — the denominator for the conversion KPI. */
export const guildSnapshots = pgTable(
  "guild_snapshots",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    memberCount: integer("member_count").notNull(),
    linkedCount: integer("linked_count").notNull(),
  },
  (t) => [uniqueIndex("guild_snapshot_week_idx").on(t.guildId, t.weekStart)],
);

/** A brand. Self-serve from signup; we email the key. */
export const brands = pgTable("brands", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  logoUrl: text("logo_url"),
  portalKeyHash: text("portal_key_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A challenge. One game, one week, one sponsor, one prize pool.
 *
 * C1 — `announced` requires a **paid** invoice, and there is no path around
 * it: the transition function reads the invoice, and no other code sets the
 * state.
 *
 * C2 — `startAt` is always a period boundary, enforced in the model rather
 * than in the UI. There is no date picker anywhere, for anyone (L6), and a
 * rule enforced only by the absence of a control is a rule until somebody
 * writes a script.
 *
 * C3 — every challenge past `draft` has an invoice (L9). No unbilled
 * challenges, including the house's own.
 */
export const challenges = pgTable(
  "challenges",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    game: text("game").notNull(),
    provider: text("provider").notNull(),
    // draft | pending_payment | scheduled | announced | live | ended
    state: text("state").notNull().default("draft"),
    // sponsored | community
    visibility: text("visibility").notNull().default("sponsored"),
    sponsorBrandId: text("sponsor_brand_id"),
    guildId: text("guild_id"),
    seriesId: text("series_id"),
    seriesIndex: integer("series_index"),
    // weekly | daily
    cadence: text("cadence").notNull().default("weekly"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    prizePoolCents: integer("prize_pool_cents").notNull().default(0),
    places: integer("places").notNull().default(1),
    // Which metrics score, and their weights: { wins: 10, matches: 1 }
    metrics: jsonb("metrics").$type<Record<string, number>>(),
    // solo | flex | both
    queue: text("queue").notNull().default("solo"),
    rankMin: integer("rank_min"),
    rankMax: integer("rank_max"),
    // Community challenges only — you must join the server to get it.
    accessKey: text("access_key"),
    invoiceId: text("invoice_id"),
    announcedAt: timestamp("announced_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("challenges_state_idx").on(t.state),
    index("challenges_start_idx").on(t.startAt),
    index("challenges_series_idx").on(t.seriesId),
  ],
);

export type Challenge = typeof challenges.$inferSelect;

/**
 * One gamer in one challenge.
 *
 * P1 — **the baseline is stored per participant per challenge.** Two
 * challenges on one game account never interfere, which is the case that makes
 * every simpler design wrong.
 *
 * P2 — `baselineAt = max(challengeStart, joinedAt)`, no exceptions.
 * P5 — score is derived from `baseline` and the latest observation. **Never
 * stored** — except `frozenScore`, which is not a cache: see B6.
 */
export const challengeParticipants = pgTable(
  "challenge_participants",
  {
    id: text("id").primaryKey(),
    challengeId: text("challenge_id").notNull(),
    userId: text("user_id").notNull(),
    linkedAccountId: text("linked_account_id").notNull(),
    // Which server gets the credit for this entrant.
    guildId: text("guild_id"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    // max(challengeStart, joinedAt). Null until the gun for an early joiner.
    baselineAt: timestamp("baseline_at", { withTimezone: true }),
    // The metric values at baselineAt. Null until stamped.
    baseline: jsonb("baseline").$type<Record<string, number>>(),
    // For the gate, and for rank-up recognition at the close.
    rankAtJoin: integer("rank_at_join"),
    rankLabelAtJoin: text("rank_label_at_join"),
    /**
     * B6 — if a gamer unlinks the account they entered with, their score
     * freezes at the last sync and they stay in the standings.
     *
     * This is NOT a stored score. It is a record of the last derivable value
     * at the moment the inputs went away, which is a different thing: it is
     * written once, on unlink, and the derivation prefers it only when there
     * is nothing left to derive from.
     */
    frozenScore: integer("frozen_score"),
    frozenAt: timestamp("frozen_at", { withTimezone: true }),
    // Final placement, written at the close. 1 = first.
    placement: integer("placement"),
  },
  (t) => [
    uniqueIndex("participant_unique_idx").on(t.challengeId, t.userId),
    index("participant_challenge_idx").on(t.challengeId),
    index("participant_account_idx").on(t.linkedAccountId),
  ],
);

export type ChallengeParticipant = typeof challengeParticipants.$inferSelect;

/** Where a challenge was announced. Reach is counted from these rows. */
export const challengeAnnouncements = pgTable(
  "challenge_announcements",
  {
    id: text("id").primaryKey(),
    challengeId: text("challenge_id").notNull(),
    guildId: text("guild_id").notNull(),
    // Members at the moment of announcement. Reach is counted, never modelled,
    // and it is frozen here so a server losing members later cannot rewrite
    // what a brand was delivered.
    memberCountAt: integer("member_count_at").notNull().default(0),
    announcedAt: timestamp("announced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("announcement_unique_idx").on(t.challengeId, t.guildId)],
);

/**
 * A request to turn a money-trophy into money.
 *
 * R5 — **stores a method word and a provider handle. Nothing else.** Not an
 * IBAN, not a card, not a last four. The structural test walks these column
 * names, and this table is the one it exists for.
 *
 * R1 — requires 18+, a verified email, an allowed country, and a trophy the
 * vault accounts for. R4 — on `paid`, the prize vault falls by exactly that
 * trophy's value.
 */
export const redemptions = pgTable(
  "redemptions",
  {
    id: text("id").primaryKey(),
    userTrophyId: text("user_trophy_id").notNull(),
    userId: text("user_id").notNull(),
    // pending | approved | sent | paid | cancelled | rejected
    status: text("status").notNull().default("pending"),
    // A WORD: `bank` | `giftcard` | `paypal`. Not an instrument.
    method: text("method").notNull(),
    // The payment provider's opaque reference for wherever this goes. We
    // cannot read it, reconstruct it, or leak anything from it.
    providerHandle: text("provider_handle"),
    // Short codes. Nothing account-shaped.
    country: text("country").notNull(),
    amountCents: integer("amount_cents").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
  },
  (t) => [
    uniqueIndex("redemption_trophy_idx").on(t.userTrophyId),
    index("redemptions_status_idx").on(t.status),
  ],
);

export type Redemption = typeof redemptions.$inferSelect;

/** A one-time code, for the email verification that only redemption asks for. */
export const emailVerifications = pgTable(
  "email_verifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    // Hashed. A code sitting in the clear is a code that can be read from a
    // backup by somebody who should not be able to become this gamer.
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [index("email_verifications_user_idx").on(t.userId)],
);

/**
 * The post queue. **Nothing fans out per-guild inline from a request.**
 *
 * docs/11-PORTED-CODE.md: "that bug class appeared three times before this
 * existed". An announcement to two hundred servers is two hundred HTTP calls
 * to Discord, each rate-limited; doing them inside a server action means the
 * action times out somewhere in the middle and nobody can say which servers
 * got the card.
 *
 * So: write a row per target and return. A cron drains it every five minutes,
 * with backoff, and gives up after four attempts — a guild that deleted the
 * channel fails identically forever, and retrying it for ever means a queue
 * nobody trusts.
 */
export const discordPostQueue = pgTable(
  "discord_post_queue",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id").notNull(),
    channelId: text("channel_id").notNull(),
    guildId: text("guild_id"),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    // pending | sent | failed
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // What this post was, so a successful landing can be counted as reach.
    ledgerChallengeId: text("ledger_challenge_id"),
    ledgerKind: text("ledger_kind"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("post_queue_due_idx").on(t.status, t.nextAttemptAt),
    index("post_queue_batch_idx").on(t.batchId),
  ],
);
