// Money with no owner and no screen (B39).
//
// Six states where a prize ends up in limbo. Each was already *reachable*; none
// of them were *visible*, which is how a support queue becomes a spreadsheet.
// Every row here names what is stuck, why, and the action that unsticks it —
// because "there is money we cannot explain" is the only genuinely unacceptable
// answer.
//
// The decisions, stated once so they are not re-litigated per incident:
//
//   1. Fewer entrants than podium places → unfilled places are NOT paid. The
//      pool returns to the sponsor as credit on their next challenge.
//   2. A tie on the metric → the earlier entry wins. Fixed in
//      `challengeStandings`, deterministic, stated before entry.
//   3. A winner deletes before collecting → held for a stated period, then
//      forfeited. The deletion screen warns first (B40).
//   4. A winner with no payout preference → the trophy holds its value
//      indefinitely. It simply cannot be redeemed yet. **Nothing expires
//      silently.**
//   5. A redemption fails at the provider → back to `approved`, with the
//      provider's reason recorded and visible.
//   6. A challenge cancelled after entries → everyone keeps their entry CP. No
//      prize. Said at cancellation.

import { and, eq, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/** How long a prize waits for a gamer who has gone before it is written off. */
export const UNCLAIMED_HOLD_DAYS = 90;

export type StuckKind =
  | "unfilled_podium"
  | "failed_payout"
  | "no_payout_preference"
  | "owner_gone"
  | "cancelled_with_entries";

export type StuckRow = {
  kind: StuckKind;
  id: string;
  /** What it is, in one line. */
  title: string;
  /** Why it is stuck. */
  why: string;
  /** What unsticks it. */
  action: string;
  /** Dollars in limbo, when there are any. */
  amount: number;
  href: string | null;
  at: string | null;
};

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Everything currently stuck, newest problem first.
 *
 * Deliberately one function returning one list rather than five admin widgets:
 * the question is "is any money stuck", and an answer split across five screens
 * is one nobody checks.
 */
export async function stuckMoney(db: DB): Promise<StuckRow[]> {
  const out: StuckRow[] = [];
  const now = Date.now();

  // ---- 5. A redemption that failed at the provider ----
  try {
    const rows = await db.select({
      id: schema.trophyRedeems.id,
      amount: schema.trophyRedeems.amount,
      currency: schema.trophyRedeems.currency,
      reason: schema.trophyRedeems.failedReason,
      at: schema.trophyRedeems.createdAt,
      name: schema.users.displayName,
    }).from(schema.trophyRedeems)
      .innerJoin(schema.users, eq(schema.users.id, schema.trophyRedeems.userId))
      .where(and(
        eq(schema.trophyRedeems.status, "approved"),
        isNotNull(schema.trophyRedeems.failedReason),
      ));
    for (const r of rows) {
      out.push({
        kind: "failed_payout", id: r.id,
        title: `${r.name} — $${Number(r.amount).toLocaleString()} ${r.currency} did not send`,
        why: r.reason ?? "The payout provider refused it.",
        action: "Fix the cause and release it again, or reject it with a reason the gamer can read.",
        amount: money(Number(r.amount)), href: "/admin/redeems",
        at: r.at?.toISOString() ?? null,
      });
    }
  } catch { /* one broken section must not hide the others */ }

  // ---- 4. A winner who cannot be paid because they never said how ----
  try {
    const rows = await db.select({
      userId: schema.userTrophies.userId,
      name: schema.users.displayName,
      slug: schema.users.slug,
      value: sql<number>`SUM(${schema.trophies.value})`,
      n: sql<number>`COUNT(*)`,
    }).from(schema.userTrophies)
      .innerJoin(schema.users, eq(schema.users.id, schema.userTrophies.userId))
      .innerJoin(schema.trophies, eq(schema.trophies.id, schema.userTrophies.trophyId))
      .where(and(
        eq(schema.userTrophies.status, "held"),
        isNull(schema.users.payoutMethod),
      ))
      .groupBy(schema.userTrophies.userId, schema.users.displayName, schema.users.slug)
      .having(sql`SUM(${schema.trophies.value}) > 0`);
    for (const r of rows) {
      out.push({
        kind: "no_payout_preference", id: r.userId,
        title: `${r.name} holds ${Number(r.n)} redeemable ${Number(r.n) === 1 ? "trophy" : "trophies"} worth $${money(Number(r.value)).toLocaleString()}`,
        // Not a problem to fix — a state to be able to see. The trophy keeps its
        // value indefinitely and nothing expires; it just cannot move yet.
        why: "They have never chosen how they want to be paid, so there is nowhere to send it.",
        action: "Nothing is owed and nothing expires. Nudge them if the amount is worth a message.",
        amount: money(Number(r.value)), href: `/u/${r.slug}`, at: null,
      });
    }
  } catch { /* ignore */ }

  // ---- 3. A prize whose owner deleted their account ----
  try {
    const cutoff = new Date(now - UNCLAIMED_HOLD_DAYS * 86400_000);
    const rows = await db.select({
      id: schema.userTrophies.id,
      at: schema.userTrophies.awardedAt,
      value: schema.trophies.value,
      name: schema.trophies.name,
      status: schema.users.status,
      display: schema.users.displayName,
    }).from(schema.userTrophies)
      .innerJoin(schema.trophies, eq(schema.trophies.id, schema.userTrophies.trophyId))
      .innerJoin(schema.users, eq(schema.users.id, schema.userTrophies.userId))
      .where(and(
        eq(schema.userTrophies.status, "held"),
        ne(schema.users.status, "active"),
      ));
    for (const r of rows) {
      const expired = !!r.at && r.at < cutoff;
      out.push({
        kind: "owner_gone", id: r.id,
        title: `${r.name} — $${money(Number(r.value)).toLocaleString()} held for ${r.display}, who is gone`,
        why: expired
          ? `Their account is closed and the ${UNCLAIMED_HOLD_DAYS}-day hold has passed.`
          : `Their account is closed. Held until ${new Date((r.at?.getTime() ?? now) + UNCLAIMED_HOLD_DAYS * 86400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`,
        action: expired
          ? "Forfeit it — the hold has run and there is nobody to pay."
          : "Nothing yet. It is held in case they come back.",
        amount: money(Number(r.value)), href: null,
        at: r.at?.toISOString() ?? null,
      });
    }
  } catch { /* ignore */ }

  // ---- 1. A finished challenge with fewer entrants than podium places ----
  try {
    const ended = await db.select({
      id: schema.challenges.id, title: schema.challenges.title,
      prizes: schema.challenges.prizes, trophyId: schema.challenges.trophyId,
      price: schema.challenges.sponsorPrice, brandId: schema.challenges.sponsorBrandId,
      at: schema.challenges.endAt,
    }).from(schema.challenges)
      .where(eq(schema.challenges.status, "completed"))
      .limit(200);
    if (ended.length) {
      const counts = await db.select({
        challengeId: schema.challengeParticipants.challengeId,
        n: sql<number>`COUNT(*)`,
      }).from(schema.challengeParticipants)
        .where(inArray(schema.challengeParticipants.challengeId, ended.map((e) => e.id)))
        .groupBy(schema.challengeParticipants.challengeId);
      const by = new Map(counts.map((c) => [c.challengeId, Number(c.n ?? 0)]));
      for (const c of ended) {
        const prizes = (c.prizes ?? (c.trophyId ? { first: [c.trophyId] } : null)) as
          { first?: string[]; second?: string[]; third?: string[] } | null;
        if (!prizes) continue;
        const places = [prizes.first, prizes.second, prizes.third].filter((p) => (p ?? []).length > 0).length;
        const entrants = by.get(c.id) ?? 0;
        if (entrants >= places) continue;
        out.push({
          kind: "unfilled_podium", id: c.id,
          title: `${c.title} — ${places} prize ${places === 1 ? "place" : "places"}, ${entrants} ${entrants === 1 ? "entrant" : "entrants"}`,
          why: `${places - entrants} ${places - entrants === 1 ? "place was" : "places were"} never filled, so ${places - entrants === 1 ? "that prize was" : "those prizes were"} not paid.`,
          action: c.brandId
            ? "Credit the unfilled share to the sponsor's next challenge."
            : "Nothing owed — this one was not sponsored.",
          amount: c.price && places > 0 ? money((Number(c.price) / places) * (places - entrants)) : 0,
          href: `/admin/challenges/${c.id}`,
          at: c.at?.toISOString() ?? null,
        });
      }
    }
  } catch { /* ignore */ }

  // ---- 6. A cancelled challenge that had entries ----
  try {
    const rows = await db.select({
      id: schema.challenges.id, title: schema.challenges.title, at: schema.challenges.endAt,
      n: sql<number>`COUNT(${schema.challengeParticipants.id})`,
    }).from(schema.challenges)
      .innerJoin(schema.challengeParticipants, eq(schema.challengeParticipants.challengeId, schema.challenges.id))
      .where(eq(schema.challenges.status, "cancelled"))
      .groupBy(schema.challenges.id, schema.challenges.title, schema.challenges.endAt);
    for (const r of rows) {
      out.push({
        kind: "cancelled_with_entries", id: r.id,
        title: `${r.title} — cancelled with ${Number(r.n)} ${Number(r.n) === 1 ? "entry" : "entries"}`,
        why: "Everyone who entered keeps the Cluster Points they earned entering. No prize is paid.",
        action: "Confirm the entrants were told. Nothing is owed.",
        amount: 0, href: `/admin/challenges/${r.id}`,
        at: r.at?.toISOString() ?? null,
      });
    }
  } catch { /* ignore */ }

  return out.sort((a, b) => b.amount - a.amount || (b.at ?? "").localeCompare(a.at ?? ""));
}

/** The one number: dollars currently in limbo. */
export function stuckTotal(rows: StuckRow[]): number {
  // `no_payout_preference` and `cancelled_with_entries` are states, not debts —
  // nothing is owed and nothing expires — so counting them would inflate the
  // figure that is supposed to mean "money we cannot explain".
  return money(rows
    .filter((r) => r.kind === "failed_payout" || r.kind === "owner_gone" || r.kind === "unfilled_podium")
    .reduce((s, r) => s + r.amount, 0));
}
