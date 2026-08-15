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
