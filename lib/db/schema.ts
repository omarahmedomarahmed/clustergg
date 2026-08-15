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

import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

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
