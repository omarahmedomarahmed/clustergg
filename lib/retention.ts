// What we keep, for how long, and why. B104.
//
// ===== TWO FINDINGS, ONE FIX =====
//
// B80 raised these separately and they are the same thing said twice:
//
//   privacy  "deletion leaves PII" — the event tables keep a row per view, per
//            click, per bot command, forever, each carrying a hashed address
//            and a session identifier.
//   scale    "unbounded event tables" — nothing ever removes a row, so the
//            largest tables in the database are the ones nobody reads after the
//            week they were written.
//
// A retention window answers both. The privacy answer is that we stop holding
// what we no longer use; the scale answer is that the tables stop growing
// without limit. Neither is a feature anybody asks for and both are the kind of
// thing that is very expensive to add later, when the table has forty million
// rows and deleting from it locks the thing.
//
// ===== WHAT IT DELETES, AND WHAT IT MUST NEVER =====
//
// It deletes OBSERVATIONS: impressions, clicks, bot command logs, server
// events. Things written because something happened, read for a few weeks, and
// then only ever counted in aggregate.
//
// It never touches MONEY or ENTITLEMENT. Not the vault ledger, not invoices,
// not payouts, not redemptions, not trophies, not quest events — a quest event
// is somebody's CP balance, and "we deleted the row your balance was derived
// from" is not a sentence this product will ever say.
//
// ===== THE COUNTS SURVIVE THE ROWS =====
//
// A brand's report is a count, and a count of rows that have been deleted is
// zero. So the delivery ledger — the per-challenge, per-guild totals a brand is
// billed against — is NOT an event table and is not touched here. It is a
// rollup written when the announcement happens, which is exactly why it exists.
//
// ⚠ For counsel: the window below is a starting position, not advice. What it
// is designed to be is EASY TO CHANGE — one constant, one job, and a test that
// asserts the money tables are excluded.

import { sql } from "drizzle-orm";
import type { DB } from "@/lib/db";

/**
 * Rows out of a raw result, whichever driver produced it.
 *
 * Neon returns `{ rows }`, PGlite returns an array. The same normalisation
 * lives in `lib/db/index.ts` for the same reason; it is four lines and not
 * worth an export that would make a data-layer detail part of an API.
 */
const rowsOf = (result: unknown): unknown[] =>
  Array.isArray(result) ? result : ((result as { rows?: unknown[] })?.rows ?? []);

/**
 * How long an observation is kept.
 *
 * 90 days. Long enough that a brand can ask about last quarter and a support
 * question about "three weeks ago" has an answer; short enough that we are not
 * holding a year of everybody's browsing because deleting it was never on
 * anybody's list.
 */
export const RETENTION_DAYS = 90;

/** Rows removed per table per run. A purge that locks the table is an outage. */
export const PURGE_BATCH = 5000;

export type PurgeResult = {
  /** Table → rows removed this run. */
  removed: Record<string, number>;
  total: number;
  /** True when a table hit the batch cap, so tomorrow's run has more to do. */
  more: boolean;
};

/**
 * Tables that hold observations, with the column that dates them.
 *
 * Written as a LIST rather than as a loop over the schema, because "which
 * tables may be deleted from" is a decision and not a derivation. A loop would
 * quietly include the next table somebody adds, and the next table somebody
 * adds might be the ledger.
 */
const OBSERVATIONS: { table: string; column: string; why: string }[] = [
  { table: "ad_impressions", column: "created_at", why: "One row per card seen. Counted into the delivery ledger the day it happens." },
  { table: "ad_clicks", column: "created_at", why: "One row per click. Same." },
  { table: "discord_command_logs", column: "created_at", why: "Which command was run where. Useful for a fortnight, never after." },
  { table: "server_events", column: "created_at", why: "The bot's own activity log." },
  { table: "portal_login_attempts", column: "created_at", why: "The lockout only ever reads the last hour. Older rows are a log of who tried what, and we do not need one." },
];

/**
 * Money and entitlement. NEVER purged, and listed by name so the test can
 * assert it — a table that must not be deleted from is worth writing down twice.
 */
export const NEVER_PURGED = [
  "vault_ledger", "brand_invoices", "invoice_lines", "server_payouts",
  "server_payout_lines", "trophy_redeems", "user_trophies", "quest_events",
  "week_allocations", "challenge_delivery", "users", "challenges",
  "challenge_participants",
] as const;

/**
 * Delete what is past the window.
 *
 * Batched and per-table, so one enormous table cannot starve the others or hold
 * a lock long enough to matter. Never throws: a purge that fails is a purge
 * that runs again tomorrow, and taking the daily cron down with it would stop
 * the jobs that actually pay people.
 */
export async function purgeOldObservations(
  db: DB,
  opts: { days?: number; batch?: number } = {},
): Promise<PurgeResult> {
  const days = opts.days ?? RETENTION_DAYS;
  const batch = opts.batch ?? PURGE_BATCH;
  const removed: Record<string, number> = {};
  let total = 0;
  let more = false;

  for (const t of OBSERVATIONS) {
    try {
      // `ctid IN (SELECT … LIMIT n)` rather than a bare `DELETE … WHERE`, so
      // the statement is bounded whatever the table looks like.
      //
      // `RETURNING`, and the count comes from the ROWS. `rowCount` is a
      // driver-specific field: PGlite leaves it at zero on a delete, so a purge
      // that read it reported "nothing to remove" on every run while quietly
      // deleting thousands. It was deleting correctly and lying about it, which
      // is the version of this bug that survives review.
      const res = await db.execute(sql.raw(
        `DELETE FROM "${t.table}" WHERE ctid IN (
           SELECT ctid FROM "${t.table}"
           WHERE "${t.column}" < now() - interval '${days} days'
           LIMIT ${batch}
         ) RETURNING 1 AS purged`,
      ));
      const n = rowsOf(res).length;
      if (n > 0) removed[t.table] = n;
      total += n;
      if (n >= batch) more = true;
    } catch { /* a table this deployment does not have, or a bad minute */ }
  }

  return { removed, total, more };
}

/** What the job says when it has run. Written here so the copy is testable. */
export function purgeSummary(r: PurgeResult): string {
  if (r.total === 0) return `Nothing older than ${RETENTION_DAYS} days to remove.`;
  const parts = Object.entries(r.removed).map(([t, n]) => `${n.toLocaleString("en-US")} ${t}`);
  return `Removed ${r.total.toLocaleString("en-US")} rows past ${RETENTION_DAYS} days — ${parts.join(", ")}.`
    + (r.more ? " More remain; tomorrow's run continues." : "");
}
