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
  doublePrecision,
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
    // ===== TWO DOORS, AND THE EMAIL MEANS DIFFERENT THINGS BEHIND EACH =====
    //
    // G2/I7a. A Discord gamer has no email until they redeem, and it is
    // verified then. An **email gamer's** address is set and verified **at
    // signup**, because it *is* the credential and a password reset is
    // impossible without it — and that verification is the one redemption
    // later requires. It is never asked twice, so a gamer may be paid without
    // `/redeem` ever asking for an address.
    email: text("email"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    // Null for a Discord-only gamer. U5/U6 — either door alone is complete.
    passwordHash: text("password_hash"),
    // ===== THE STAFF GRANT. NOT AN IDENTITY (A10, U7) =====
    //
    // Cluster staff are gamers. This column opens the console and changes
    // **nothing** about how they play, score or redeem — U8: a staff member
    // places in challenges they run, on merit, because the metrics are the
    // same for every entrant, trophy values are held to the prize pool by T3,
    // and points come from provider stats we read. There is no lever.
    //
    // It lives on `users` rather than in a side table because a staff member
    // *is* a gamer; a separate row would be a second account, which is the
    // thing the whole identity model refuses.
    staffTitleId: text("staff_title_id"),
    // `teen` | `adult`. Null until onboarding sets it.
    ageBand: text("age_band"),
    country: text("country"),
    discordId: text("discord_id").unique(),
    // ===== THE PARENT SERVER. WHERE THEY FIRST PRESSED ANY BOT BUTTON =====
    //
    // Permanent (A1). Not "the server they signed up through" and not "a
    // server they are in" — the first click, wherever onboarding later
    // finished (A2). Null is a real and complete state: a web gamer has no
    // parent, does everything, and earns no server anything (A7/U5).
    //
    // A gamer can never change this. Cluster admin can, logged (A8) — and
    // even then it cannot move a closed week, because scoring reads the copy
    // frozen onto each entry, never this column (P6).
    parentGuildId: text("parent_guild_id"),
    parentStampedAt: timestamp("parent_stamped_at", { withTimezone: true }),
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
 * A brand's login. **A separate table from `users`, on purpose** (I2, B4).
 *
 * One email could otherwise be both a brand and a gamer, and a brand landing
 * in gamer onboarding is a mess. The separation is structural rather than a
 * flag: there is no column on this row that could make it a gamer, and no
 * column on `users` that could make one a brand.
 *
 * B3 — one brand, one login, and shared credentials are accepted. That is why
 * `lastLoginAt`/`lastLoginIp` are here and why every spend is logged with an
 * actor and an IP: when two people share a password, a disagreement still
 * needs an answer.
 */
export const brandUsers = pgTable(
  "brand_users",
  {
    id: text("id").primaryKey(),
    brandId: text("brand_id").notNull(),
    email: text("email").notNull().unique(),
    // Null between the invite being issued and it being redeemed. B1 — the
    // key is dead the moment `inviteRedeemedAt` is set, and the check is the
    // timestamp rather than deleting the hash, so "already used" and "never
    // existed" stay distinguishable in support.
    passwordHash: text("password_hash"),
    inviteKeyHash: text("invite_key_hash"),
    inviteRedeemedAt: timestamp("invite_redeemed_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastLoginIp: text("last_login_ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("brand_users_brand_idx").on(t.brandId)],
);

/**
 * A password reset, for a gamer **or** a brand (I1d).
 *
 * One mechanism, two subject kinds, because two implementations of "prove you
 * hold this address" is two places for the token comparison to be wrong.
 *
 * The token is stored hashed and single-use: `usedAt` is set on redemption, so
 * a link in an old email stops working the moment a newer one is used. What we
 * store is never the token itself — an attacker with the database would
 * otherwise hold a working reset link for every account.
 */
export const passwordResets = pgTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    // `gamer` | `brand`
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_resets_subject_idx").on(t.subjectKind, t.subjectId)],
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
/**
 * A closed week's **complete working**, per server. Written once, at the close.
 *
 * ===== THIS IS NOT AN EXCEPTION TO DERIVED-NEVER-STORED =====
 *
 * House rule 1 says a balance is `sum(ledger)`, and it is right: a balance is
 * derived because **its inputs are permanent.** Every ledger row that ever
 * existed still exists, so the sum can always be taken again.
 *
 * A week's standing has the opposite property. Everything it rests on is
 * **live and moves**: a member leaves, a profile lapses, an admin re-parents a
 * gamer (A8), a server is renamed, the gun fires again and overwrites the
 * gate. By Tuesday of week 4, week 3 cannot be re-derived — not "would be
 * expensive to", *cannot*, because the inputs are gone.
 *
 * So it is recorded, the same way and for the same reason a ledger row is:
 * a reading frozen at the instant it was true. It is the same shape as
 * `baseline` and `parentGuildIdAtBaseline`, which nobody calls a violation.
 *
 * **Do not delete this as a stored derivation.** That is the edit this comment
 * exists to stop, and the specification (07, "the weekly record") says the
 * same thing in the same words.
 *
 * The number alone was not enough. `server_payouts` keeps what a server was
 * paid, and a disputed payout is exactly the moment somebody needs to see
 * **why** — which is the working, not the total.
 */
export const weekRecords = pgTable(
  "week_records",
  {
    id: text("id").primaryKey(),
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    guildId: text("guild_id").notNull(),
    /** W5 — **copied, not joined.** A server renamed in week 9 reads as its week-3 name in week 3. */
    guildName: text("guild_name").notNull(),

    // W7 — the gun's answer, kept **per week**. The guild row carries only the
    // current week's flag, and a closed week's gate is never overwritten by
    // the next Monday.
    eligible: boolean("eligible").notNull(),
    eligibilityFrozenAt: timestamp("eligibility_frozen_at", { withTimezone: true }),
    /** W6 — **why**, field by field. "You earned nothing and here is exactly why." */
    linkedAtGun: integer("linked_at_gun").notNull().default(0),
    profileCompleteAtGun: boolean("profile_complete_at_gun").notNull().default(false),
    ineligibleReason: text("ineligible_reason"),

    /** KPI 1 — the credited total, halves included. */
    entrants: doublePrecision("entrants").notNull().default(0),
    // KPI 2 and 3, **with both sides**, so a ratio can be checked and not
    // merely read. A stored ratio nobody can reconstruct is a number an owner
    // has to take on faith, which is the opposite of what this table is for.
    conversionNumerator: integer("conversion_numerator").notNull().default(0),
    conversionDenominator: integer("conversion_denominator").notNull().default(0),
    conversion: doublePrecision("conversion").notNull().default(0),
    activationNumerator: doublePrecision("activation_numerator").notNull().default(0),
    activationDenominator: doublePrecision("activation_denominator").notNull().default(0),
    activation: doublePrecision("activation").notNull().default(0),

    rank: integer("rank"),
    scoredShareCents: integer("scored_share_cents").notNull().default(0),
    flatShareCents: integer("flat_share_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    /** The week's pool and field size, so a share is legible on its own. */
    poolCents: integer("pool_cents").notNull().default(0),
    serversInPool: integer("servers_in_pool").notNull().default(0),
    /** The draft this became. Null when nothing was owed. */
    payoutId: text("payout_id"),

    /**
     * W2 — **never updated, never deleted.** A correction is a new row naming
     * what it supersedes, exactly like the ledger. There is deliberately no
     * unique index on (week, guild): a superseding row is a second row for
     * that pair, and a unique index would forbid the only correction mechanism
     * this table has.
     */
    supersedesId: text("supersedes_id"),
    supersededReason: text("superseded_reason"),
    writtenAt: timestamp("written_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("week_records_week_idx").on(t.weekStart),
    index("week_records_guild_idx").on(t.guildId, t.weekStart),
  ],
);

export type WeekRecord = typeof weekRecords.$inferSelect;

/**
 * Which servers contributed to which challenges, and how much of each entrant.
 *
 * W4 — `Σ entrantsCredited` for a server **equals its `week_records.entrants`**.
 * The breakdown reconciles to the total or one of them is wrong, and that is
 * checked rather than assumed.
 *
 * `entrantsCredited` is a decimal and `entrantsWhole` is a head count, and
 * they are both here because they answer different questions. Two halves read
 * **1.0 credited over 2 people**; a same-server entrant reads **1.0 over 1**.
 * Without the head count, an owner cannot tell those apart — and the
 * difference is the whole of A4 versus A5.
 */
export const weekCredits = pgTable(
  "week_credits",
  {
    id: text("id").primaryKey(),
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    guildId: text("guild_id").notNull(),
    challengeId: text("challenge_id").notNull(),
    // W5 again — as they were, on the day.
    challengeTitle: text("challenge_title").notNull(),
    game: text("game").notNull(),
    brandName: text("brand_name"),
    /** `parent` | `join` | `both` — which capacity earned the credit. */
    role: text("role").notNull(),
    entrantsCredited: doublePrecision("entrants_credited").notNull().default(0),
    /** The head count behind that decimal, so ½ + ½ is visible as two people. */
    entrantsWhole: integer("entrants_whole").notNull().default(0),
    scoredAboveZero: integer("scored_above_zero").notNull().default(0),
    writtenAt: timestamp("written_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("week_credits_week_idx").on(t.weekStart, t.guildId),
    index("week_credits_challenge_idx").on(t.challengeId),
  ],
);

export type WeekCredit = typeof weekCredits.$inferSelect;

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
    // ===== THE SERVER PROFILE — SIX FIELDS, ALL REQUIRED TO BE SCORED =====
    //
    // 12 §5: ten linked members is not enough. A server we cannot describe is
    // one we cannot sell, so the profile is a pool gate and not decoration.
    // `announceChannelId` is the sixth field and lives here rather than in
    // settings for that reason: it is part of what makes a server complete.
    announceChannelId: text("announce_channel_id"),
    /**
     * **Their members' ages**, clearly labelled — and nothing to do with the
     * owner's own age band (12 §5). Two different questions, asked in two
     * different places, and neither is ever a substitute for the other: the
     * owner's is a compliance fact about one person, this is a description of
     * a community we are selling to a brand.
     */
    memberAgeRange: text("member_age_range"),
    /** Games their members play. */
    gamesPlayed: jsonb("games_played").$type<string[]>(),
    /** A permanent invite. Shown publicly and on their community-challenge pages. */
    inviteUrl: text("invite_url"),
    /** Their public server page. */
    coverImageUrl: text("cover_image_url"),
    // The one-line bio. Null means never described.
    community: text("community"),
    // ===== THERE IS NO PORTAL KEY HERE, AND THAT IS THE POINT =====
    //
    // S1 — the server-owner credential is **deleted entirely**. A portal is
    // opened by a linked Discord identity that Discord says admins this guild,
    // never by something we issued and they kept. The column is gone rather
    // than nulled: a credential column that still exists is a credential
    // somebody re-populates.
    //
    // Who we talk to about this server, from the portal's Settings page.
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    // ===== HOUSE RULE 5. A WORD AND AN OPAQUE HANDLE. =====
    //
    // P2 in docs/02-MONEY.md: what we store is a **preference word**
    // (`bank`, `giftcard`, …) and an **opaque provider handle**. Nothing
    // account-shaped, which is why neither of these columns can hold one:
    // the word is from a fixed list and the handle is whatever the payment
    // provider hands back, meaningless to us and useless if it leaks.
    payoutPreference: text("payout_preference"),
    payoutHandle: text("payout_handle"),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
    // ===== OWNERSHIP. THE ONLY PERSON WHO TOUCHES MONEY (P1) =====
    //
    // Discovered at sign-in, at link, or on refresh (S0) — never asked for.
    // `ownerFirstSignInAt` is null until they appear at all, which is what
    // drives the 4-week reassignment clock and the "portal was already
    // waiting" state (P4).
    ownerDiscordId: text("owner_discord_id"),
    ownerFirstSignInAt: timestamp("owner_first_sign_in_at", { withTimezone: true }),
    // A DM can fail — an owner who blocks DMs from server members never gets
    // it, and Discord says so quietly. 12 §6: a recorded state the registry
    // shows, never an error swallowed on a background path.
    ownerDmState: text("owner_dm_state"),

    // ===== CAPTURED AT THE INSTALL REDIRECT OR LOST FOREVER (G1) =====
    //
    // Discord's API will never tell us who added the bot. If the redirect does
    // not record it, no later call, job or refresh can recover it.
    installedByDiscordId: text("installed_by_discord_id"),
    installerWasOwner: boolean("installer_was_owner"),

    // T1–T4. The 14-day confirmation timeout and the 7-day withdrawal freeze.
    ownershipTransferAt: timestamp("ownership_transfer_at", { withTimezone: true }),
    transferConfirmedAt: timestamp("transfer_confirmed_at", { withTimezone: true }),

    // ===== ELIGIBILITY: FROZEN AT MONDAY'S GUN (12 §4) =====
    //
    // *Is this server in the pool at all?* — `linked ≥ 10` **and** a complete
    // profile, decided once at the gun and **never re-checked mid-week** (E3).
    // What the pool page shows on Wednesday is what pays on Friday.
    //
    // All three KPIs stay live. This is the only thing that freezes, and the
    // distinction is what makes the week coherent: a server cannot be dropped
    // out of a pool it has spent four days visibly earning in, and a server
    // that was not ready on Monday cannot buy its way in on Tuesday.
    //
    // Stored rather than derived, and that is not a violation of "derived,
    // never stored": a freeze is a *record of an event*, like a baseline. The
    // inputs it read on Monday are gone by Wednesday, so there is nothing left
    // to derive it from.
    // W7 — **the current week's flag, and nothing older.** The per-week answer
    // and its reasons live in `week_records`, written at the close, so the next
    // Monday's gun overwriting these three columns cannot touch a closed week.
    // These exist so the open week has an answer before its record is written.
    eligibilityFrozenAt: timestamp("eligibility_frozen_at", { withTimezone: true }),
    eligibleThisWeek: boolean("eligible_this_week"),
    // The **reasons** behind that flag, so the record can copy why and not
    // only what. W6 — an ineligible server is owed "here is exactly why",
    // field by field, and by the close the live numbers have moved.
    linkedAtGun: integer("linked_at_gun"),
    profileCompleteAtGun: boolean("profile_complete_at_gun"),

    // Removal freezes reach; earnings survive (S9).
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [index("guilds_removed_idx").on(t.removedAt)],
);

export type Guild = typeof guilds.$inferSelect;

/**
 * A dated reading of one server, taken **only when its owner opts in**.
 *
 * ===== THIS IS ANALYTICS, AND NO DOLLAR MAY DEPEND ON IT (S2/N9) =====
 *
 * It used to hold the conversion denominator. S3 deleted that: the denominator
 * is computed live in `lib/pool/eligibility.ts`, and **nothing in the weekly
 * cycle may read this table** — not eligibility, not a KPI, not the pool, not
 * a payout. Stated falsifiably: *drop the table and every dollar is
 * identical*, which is asserted twice — once as a unit and once inside the
 * four-week simulation.
 *
 * The reason is not tidiness. A row here exists because an owner pressed a
 * button, under a permission they granted and could have declined. A dollar
 * that depended on it would let a server change its own earnings by
 * refreshing, and would make a revocable permission load-bearing on the pool.
 *
 * S1 — **every row carries `takenAt` and `takenBy`, and is never displayed
 * without the date.** Neither the owner nor admin ever sees an undated number:
 * a stale snapshot presented as current is worse than no snapshot, because it
 * is acted on.
 */
export const guildSnapshots = pgTable(
  "guild_snapshots",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    /** S1. The reading's date, and the reason nothing here is ever bare. */
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    /** Who pressed Update — an owner, an administrator, or Cluster admin. */
    takenBy: text("taken_by"),
    memberCount: integer("member_count").notNull(),
    /** How many of their members are linked to Cluster. */
    linkedCount: integer("linked_count").notNull(),
    /** Roles on the server, and who holds them. Read only, and never scored. */
    rolesJson: jsonb("roles_json").$type<{ id: string; name: string; members: number }[]>(),
    roleHoldersJson: jsonb("role_holders_json").$type<Record<string, string[]>>(),
  },
  (t) => [index("guild_snapshots_guild_idx").on(t.guildId, t.takenAt)],
);

export type GuildSnapshot = typeof guildSnapshots.$inferSelect;

/**
 * The analytics grant. **One row per guild, and it is not a session.**
 *
 * N1 — granted once, per server, and it **does not expire**. Signing out
 * changes nothing: the bot keeps its access and we keep the snapshot. There is
 * deliberately no session column, because a grant that expired with a session
 * would be re-asked on every sign-in and an owner who clicks through it once is
 * an owner who has not consented to anything.
 *
 * N7 — the Update **cooldown is on the guild**, never on the session. Signing
 * out and back in is not a way around it, and that is why `cooldownUntil`
 * lives on this row rather than anywhere a login could clear.
 */
export const guildAnalyticsConsent = pgTable("guild_analytics_consent", {
  guildId: text("guild_id").primaryKey(),
  /** The Discord identity that allowed it. Kept, because consent has an author. */
  grantedBy: text("granted_by"),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  lastPullAt: timestamp("last_pull_at", { withTimezone: true }),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
});

export type GuildAnalyticsConsent = typeof guildAnalyticsConsent.$inferSelect;

/**
 * A brand — the company. Its **login** lives in `brand_users`.
 *
 * The key that used to live here is gone: B1 makes it a **one-time invite**
 * that is exchanged for an email-and-password account, so the credential now
 * belongs to a person's row rather than to the company's.
 */
export const brands = pgTable("brands", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  logoUrl: text("logo_url"),
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
    /**
     * P6 — **where they pressed Join. The only server column on this row.**
     *
     * Named `joinGuildId` and not `guildId` deliberately: the invariant
     * forbids "a second `guildId` meaning something adjacent", and a bare
     * `guildId` beside `parentGuildIdAtBaseline` is exactly that. One of these
     * two decides half the money and the other decides the other half, and a
     * name that does not say which is a name somebody reads wrong once.
     */
    joinGuildId: text("join_guild_id"),
    /**
     * P6 / A1a — **the parent, frozen at the same instant as the baseline.**
     *
     * The gun for an early joiner, Join for a mid-week joiner —
     * `max(challengeStart, joinedAt)`, one rule for both. **Never read live at
     * scoring time.** A1b: an admin correcting a gamer's parent in week 6 must
     * not silently move week 3's money, and this column is the whole mechanism
     * — the scoring path reads it and is structurally unable to reach
     * `users.parentGuildId`.
     */
    parentGuildIdAtBaseline: text("parent_guild_id_at_baseline"),
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
    // ===== WHERE IT GOES: A CHANNEL, OR ONE PERSON =====
    //
    // L11 — *DMs are sent through the post queue, never inline.* A per-guild
    // loop inside a request is already in `10-SETUP` §8's outage table, and a
    // DM is exactly that shape: one Discord round trip per owner, on a path
    // that must not take a request down.
    //
    // Exactly one of these is set. `channelId` lost its NOT NULL for this
    // rather than being made to carry a user id under a flag — a column whose
    // meaning depends on another column is a column somebody reads wrongly.
    channelId: text("channel_id"),
    dmUserId: text("dm_user_id"),
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

/**
 * ===== `guild_members` IS DELETED, AND THIS IS WHY =====
 *
 * It existed for one rule: K1 once split an entrant "across every server a
 * gamer belongs to", ½ each, which `challenge_participants` cannot express —
 * it is unique on (challenge, gamer) (P4), so it records the one server they
 * clicked Join in and cannot record the three they are in.
 *
 * That rule is gone. 12 §3 replaces it with **parent + join**: at most two
 * servers earn from one gamer, and both are recorded on the entry itself —
 * `joinGuildId` and `parentGuildIdAtBaseline`. No membership table, no
 * per-server dilution, and no read of a Discord member list on any path the
 * product depends on (12 §7).
 *
 * The rows were **not migrated into `parentGuildId`.** A membership is not a
 * first bot click, and inventing a permanent, unchangeable attribution out of
 * data that never meant that is the error class this branch exists to end. A
 * `users` row that predates the parent stamp gets null, which A7 already
 * defines: they do everything, and no server earns.
 */

/**
 * Staff, and which department they are in.
 *
 * Separate from `users` on purpose. A staff member is a gamer who also works
 * here, and conflating the two would put a `department` column on the gamer
 * directory — which is the table house rule 7 exists to keep people out of.
 */
/**
 * Everyone we have **seen** holding ADMINISTRATOR or the mapped role.
 *
 * G5 — accumulated from interaction payloads and OAuth grants, **never a
 * member list**. Who holds a Discord role lives only in the member list, and
 * we do not read one on any path the product depends on (12 §7).
 *
 * So this table is honestly incomplete, and the registry says so in words:
 * somebody who holds the role and has never pressed a button will not appear.
 * We do not take the GUILD_MEMBERS intent to close that gap.
 */
/**
 * A staff title, and the departments it reaches.
 *
 * ST1 — **only the super admin grants one**, and it is logged. ST2 — whatever
 * a title says, the gamer directory and the linked-account list stay
 * admin-only (house rule 7). A title feeds `lib/admin/auth.ts`; it never
 * overrides it.
 */
/**
 * One thread per server, one per brand. **Two inboxes, never merged** (MS2).
 *
 * `side` is not decoration and it is not derivable from which id is set — it
 * is what the admin inbox queries on, and it is the reason a brand thread can
 * never appear in the server inbox by a query somebody wrote slightly wrong.
 * Exactly one of `guildId` and `brandId` is set (07).
 *
 * MS1 — **a thread whose last message is not from Cluster keeps alerting.**
 * `lastAuthorKind` is what that reads, and it is deliberately not `unread` or
 * `needsReply`: a flag can be cleared by opening the page, and H7's whole
 * point is that **silence is the failure mode the page exists to prevent.**
 */
export const messageThreads = pgTable(
  "message_threads",
  {
    id: text("id").primaryKey(),
    /** `server` | `brand` */
    side: text("side").notNull(),
    guildId: text("guild_id"),
    brandId: text("brand_id"),
    subject: text("subject"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    /** `server` | `brand` | `cluster` — who spoke last. MS1 reads this. */
    lastAuthorKind: text("last_author_kind"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("message_threads_side_idx").on(t.side, t.lastMessageAt),
    index("message_threads_guild_idx").on(t.guildId),
    index("message_threads_brand_idx").on(t.brandId),
  ],
);

export type MessageThread = typeof messageThreads.$inferSelect;

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull(),
    /** `server` | `brand` | `cluster` */
    authorKind: text("author_kind").notNull(),
    authorId: text("author_id"),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * When Cluster opened it. **Reading is not answering** — this exists so a
     * human can see what they have looked at, and MS1 deliberately does not
     * consult it. A read that cleared the alert is how an unanswered thread
     * goes quiet, which is the exact failure H7 names.
     */
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [index("messages_thread_idx").on(t.threadId, t.sentAt)],
);

export type Message = typeof messages.$inferSelect;

export const staffTitles = pgTable("staff_titles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // The department words this title may reach. An array rather than one
  // column, because a title like "Finance lead" legitimately reaches two.
  departments: jsonb("departments").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by"),
});

/**
 * An administrator asks; the guild owner answers.
 *
 * ===== WHY A TABLE AND NOT A FLAG ON THE CHALLENGE =====
 *
 * 12 §6 splits one row off from everything else: an administrator may
 * **request** a community challenge and only the guild owner may **approve the
 * spend**. That gap has to be somewhere, and a draft challenge cannot hold it
 * — a draft with no bill is a thing the owner has not seen, and a bill that
 * exists is money already committed.
 *
 * 07 says it plainly: *"there is nowhere else to hold a pending request."*
 *
 * `approvedBy` **must be the guild owner**, and that is enforced in
 * `lib/portal/spend.ts` rather than assumed — an administrator who could write
 * this column would have the owner's authority with an extra step.
 */
export const spendRequests = pgTable(
  "spend_requests",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    /** The Discord identity that asked. An administrator, usually. */
    requestedBy: text("requested_by").notNull(),
    /** `community_challenge`. A word, because there is one kind so far. */
    kind: text("kind").notNull(),
    tier: integer("tier"),
    /** What to build if it is approved: title, game, provider, start. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    // pending | approved | paid | rejected
    state: text("state").notNull().default("pending"),
    /** The guild owner's Discord id. Never an administrator's. */
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
    /** Written on approval — what the request became. */
    challengeId: text("challenge_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("spend_requests_guild_idx").on(t.guildId, t.state)],
);

export type SpendRequest = typeof spendRequests.$inferSelect;

export const guildAdmins = pgTable(
  "guild_admins",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    discordId: text("discord_id").notNull(),
    // `administrator` | `mapped_role`
    source: text("source").notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("guild_admin_unique_idx").on(t.guildId, t.discordId)],
);

export const staff = pgTable("staff", {
  userId: text("user_id").primaryKey(),
  name: text("name").notNull(),
  // `admin` | `finance` | `support` | `sales`
  department: text("department").notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Every message the platform owed somebody, and whether it left.
 *
 * ===== ONE TABLE, BECAUSE L3 AND L10 ASK THE SAME QUESTION =====
 *
 * `15-DELIVERY` L3 wants an operator asked *"did they get the code?"* to have
 * an answer that is not a guess. L10 wants the same answer about a DM an owner
 * may have blocked. Two tables would be two half-answers, and the operator
 * question is *"did we tell them"* rather than *"which transport did we use"*.
 *
 * `channel` is `email` or `dm`. `kind` is which of the messages this is —
 * `verification`, `brand_invite`, `password_reset`, `owner_earnings`,
 * `redemption_progress`, `guild_installed`, `ownership_transfer`,
 * `reassignment_warning`.
 *
 * ===== WHAT IS NOT HERE =====
 *
 * **The body.** A verification code, a reset token and a one-time brand key
 * all travel through this and none of them may be stored: a table of every
 * secret we ever sent is worth more to somebody than the accounts it opens.
 * `subject` is a line an operator can recognise, never the payload.
 *
 * `status` is `sent` | `failed` | `undelivered`, and the third is not a
 * synonym for the second. **Undelivered means we never tried** — L2's missing
 * `RESEND_API_KEY`, which is a misconfiguration somebody can fix, not an
 * outage. A row that says `failed` means Resend or Discord refused it, and
 * `error` says what they said.
 */
export const deliveries = pgTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    // `email` | `dm`
    channel: text("channel").notNull(),
    kind: text("kind").notNull(),
    /** The address or the Discord id. Who we were talking to, never what we said. */
    recipient: text("recipient").notNull(),
    /** Our own id for them, when there is one. Null for a brand invite to a stranger. */
    userId: text("user_id"),
    guildId: text("guild_id"),
    subject: text("subject"),
    // `sent` | `failed` | `undelivered`
    status: text("status").notNull(),
    error: text("error"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deliveries_status_idx").on(t.status, t.attemptedAt),
    index("deliveries_recipient_idx").on(t.recipient),
    index("deliveries_guild_idx").on(t.guildId),
  ],
);

export type Delivery = typeof deliveries.$inferSelect;
