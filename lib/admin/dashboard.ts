// The admin dashboard.
//
// A1 — **the challenges dashboard is the most important page on the
// platform.** Built first, before the rest of admin, because docs/08 says so
// and because the reason is real: it is the only surface that answers "what is
// stopping this week from happening", and every other admin page is a detail
// of one answer it gives.
//
// docs/01-CYCLE.md: it must show **exactly what is blocking each challenge** —
// unpaid, paid but not set up, set up but not announced, live, closed. Not
// "needs attention". The specific thing, in a sentence somebody can act on.
//
// Checks 1–3 from docs/07-DATA-MODEL.md belong here as **live indicators, not
// a nightly report**: a nightly report tells you the platform's core promise
// was broken yesterday.

import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { readinessOf, STATE_LABEL, type ChallengeState } from "../challenges/lifecycle.ts";
import { checkPrizeVault, type PrizeVaultCheck } from "../money/prize-vault.ts";
import { balanceOf, allBalances, ledgerBalances } from "../money/ledger.ts";
import { maxAllocationCents, poolForWeek } from "../money/pool.ts";
import { weekFor, weekStartPlus, phaseAt } from "../challenges/week.ts";
import { formatMoney } from "../money/amounts.ts";

export type BlockedChallenge = {
  id: string;
  title: string;
  game: string;
  state: ChallengeState;
  stateLabel: string;
  weekStart: Date;
  /** The specific things stopping it, each a sentence. Never "needs attention". */
  blocking: string[];
  ready: boolean;
};

export type Indicator = {
  key: "prize_vault" | "prize_pool_guards" | "pool_allocation" | "announced_unpaid" | "ledger";
  ok: boolean;
  headline: string;
  detail: string;
};

export type Dashboard = {
  now: Date;
  phase: "run" | "grace";
  thisWeek: Date;
  nextWeek: Date;
  /** Everything not yet announced, with what is blocking each. */
  queue: BlockedChallenge[];
  /** Live indicators — checks 1 to 3, on the page, not in a report. */
  indicators: Indicator[];
  vault: PrizeVaultCheck;
  balances: Record<string, number>;
  poolThisWeekCents: number;
  poolCeilingCents: number;
  counts: { live: number; announced: number; scheduled: number; draft: number; ended: number };
};

export async function dashboard(db: DB, now = new Date()): Promise<Dashboard> {
  const week = weekFor(now);
  const nextWeek = weekStartPlus(now, 1);

  // Everything that has not gone out yet, this week or later. A challenge in
  // the past that never announced is a different problem and has its own row.
  const pending = await db
    .select()
    .from(schema.challenges)
    .where(
      or(
        eq(schema.challenges.state, "draft"),
        eq(schema.challenges.state, "pending_payment"),
        eq(schema.challenges.state, "scheduled"),
      ),
    )
    .orderBy(schema.challenges.startAt);

  const queue: BlockedChallenge[] = [];
  for (const c of pending) {
    const readiness = await readinessOf(db, c.id);
    const blocking = [...readiness.blocking];

    // A challenge whose week has already started and which never announced is
    // the worst state on the platform: a brand paid and nothing happened.
    if (c.startAt.getTime() <= now.getTime()) {
      blocking.unshift(
        `Its week started on ${c.startAt.toISOString().slice(0, 10)} and it was never announced. ` +
          `Push it to a later week or refund it — it cannot run retrospectively.`,
      );
    }

    queue.push({
      id: c.id,
      title: c.title,
      game: c.game,
      state: c.state as ChallengeState,
      stateLabel: STATE_LABEL[c.state as ChallengeState],
      weekStart: c.startAt,
      blocking,
      ready: readiness.ready && c.startAt.getTime() > now.getTime(),
    });
  }

  const vault = await checkPrizeVault(db);
  const balances = await allBalances(db);
  const serverVault = await balanceOf(db, "server");
  const poolThisWeekCents = await poolForWeek(db, week.start);
  const poolCeilingCents = maxAllocationCents(serverVault);

  // Check 4: no announced challenge with an unpaid invoice. This should be
  // impossible — the transition refuses it — so if it ever fires, something
  // wrote a state outside the model.
  const announced = await db
    .select()
    .from(schema.challenges)
    .where(
      or(
        eq(schema.challenges.state, "announced"),
        eq(schema.challenges.state, "live"),
        eq(schema.challenges.state, "ended"),
      ),
    );
  const unpaidAnnounced: string[] = [];
  for (const c of announced) {
    if (!c.invoiceId) {
      unpaidAnnounced.push(`${c.title} has no bill at all`);
      continue;
    }
    const [invoice] = await db
      .select({ paidAt: schema.invoices.paidAt })
      .from(schema.invoices)
      .where(eq(schema.invoices.id, c.invoiceId));
    if (!invoice?.paidAt) unpaidAnnounced.push(`${c.title} is announced and unpaid`);
  }

  // Check 2: every challenge's podium trophies equal its prize pool.
  const mismatches: string[] = [];
  for (const c of announced) {
    if (c.prizePoolCents === 0) continue;
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${schema.trophies.valueCents}), 0)::int` })
      .from(schema.trophies)
      .where(and(eq(schema.trophies.challengeId, c.id), eq(schema.trophies.type, "podium")));
    const total = row?.total ?? 0;
    if (total !== c.prizePoolCents) {
      mismatches.push(
        `${c.title}: trophies ${formatMoney(total)} against a pool of ${formatMoney(c.prizePoolCents)}`,
      );
    }
  }

  const indicators: Indicator[] = [
    {
      key: "prize_vault",
      ok: vault.holds,
      headline: vault.holds
        ? "Prize vault green"
        : vault.state === "over_allocated"
          ? "Prize vault OVER-ALLOCATED"
          : `Prize vault ${vault.state.replace("_", " ")}`,
      detail: vault.explanation,
    },
    {
      key: "prize_pool_guards",
      ok: mismatches.length === 0,
      headline:
        mismatches.length === 0
          ? "Every prize pool matches its trophies"
          : `${mismatches.length} challenge${mismatches.length === 1 ? "" : "s"} with a prize-pool mismatch`,
      detail: mismatches.join(" · ") || "Nothing over, nothing under.",
    },
    {
      key: "pool_allocation",
      ok: poolThisWeekCents <= poolCeilingCents,
      headline: `Pool ${formatMoney(poolThisWeekCents)} of a ${formatMoney(poolCeilingCents)} ceiling`,
      detail:
        `The server vault holds ${formatMoney(serverVault)}. A pool may never exceed half of it — ` +
        `the held half funds refunds, disputes and quiet weeks.`,
    },
    {
      key: "announced_unpaid",
      ok: unpaidAnnounced.length === 0,
      headline:
        unpaidAnnounced.length === 0
          ? "Nothing announced is unpaid"
          : `${unpaidAnnounced.length} announced and unpaid`,
      detail:
        unpaidAnnounced.join(" · ") ||
        "There can never be an announced challenge that is unpaid, and there is not.",
    },
    {
      key: "ledger",
      ok: await ledgerBalances(db),
      headline: "Ledger balances",
      detail:
        `Income ${formatMoney(balances.income)} · prize ${formatMoney(balances.prize)} · ` +
        `server ${formatMoney(balances.server)} · Cluster ${formatMoney(balances.cluster)}`,
    },
  ];

  const counts = { live: 0, announced: 0, scheduled: 0, draft: 0, ended: 0 };
  const all = await db.select({ state: schema.challenges.state }).from(schema.challenges);
  for (const c of all) {
    if (c.state === "live") counts.live++;
    else if (c.state === "announced") counts.announced++;
    else if (c.state === "scheduled") counts.scheduled++;
    else if (c.state === "ended") counts.ended++;
    else counts.draft++;
  }

  return {
    now,
    phase: phaseAt(now),
    thisWeek: week.start,
    nextWeek,
    queue,
    indicators,
    vault,
    balances,
    poolThisWeekCents,
    poolCeilingCents,
    counts,
  };
}

/**
 * The three notifications. A2 — admin should never have to go looking.
 *
 * Derived from rows rather than delivered by a queue, so a notification cannot
 * be lost and cannot be duplicated: the dashboard asks "what happened since I
 * last looked" and the rows answer.
 */
export type AdminNotification = {
  kind: "brand_signup" | "brand_building" | "challenge_paid";
  at: Date;
  headline: string;
  refId: string;
};

export async function notifications(
  db: DB,
  since: Date,
  limit = 50,
): Promise<AdminNotification[]> {
  const out: AdminNotification[] = [];

  const brands = await db
    .select()
    .from(schema.brands)
    .where(gt(schema.brands.createdAt, since))
    .limit(limit);
  for (const b of brands) {
    out.push({
      kind: "brand_signup",
      at: b.createdAt,
      headline: `${b.name} signed up`,
      refId: b.id,
    });
  }

  const drafts = await db
    .select()
    .from(schema.challenges)
    .where(and(gt(schema.challenges.createdAt, since), eq(schema.challenges.state, "draft")))
    .limit(limit);
  for (const c of drafts) {
    out.push({
      kind: "brand_building",
      at: c.createdAt,
      headline: `A draft appeared: ${c.title}`,
      refId: c.id,
    });
  }

  const paid = await db
    .select()
    .from(schema.invoices)
    .where(and(gt(schema.invoices.paidAt, since), eq(schema.invoices.status, "paid")))
    .limit(limit);
  for (const i of paid) {
    out.push({
      kind: "challenge_paid",
      at: i.paidAt as Date,
      headline: `Invoice paid — needs setup`,
      refId: i.id,
    });
  }

  return out.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/**
 * The weekend routine, as a checklist with state.
 *
 * docs/08: *"it survives one person being ill."* That is the requirement, and
 * it is why the steps are derived from the platform's own rows rather than
 * ticked by hand: a checklist somebody ticks is a checklist that says "done"
 * when they meant "started".
 */
export type WeekendStep = {
  key: string;
  title: string;
  done: boolean;
  detail: string;
};

export async function weekendChecklist(db: DB, now = new Date()): Promise<WeekendStep[]> {
  const week = weekFor(now);
  const nextWeek = weekStartPlus(now, 1);

  const closed = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.challenges)
    .where(and(eq(schema.challenges.startAt, week.start), eq(schema.challenges.state, "ended")));

  const stillLive = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.challenges)
    .where(
      and(eq(schema.challenges.state, "live"), lt(schema.challenges.endAt, now)),
    );

  const poolCents = await poolForWeek(db, week.start);
  const drafts = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.serverPayouts)
    .where(
      and(eq(schema.serverPayouts.weekStart, week.start), eq(schema.serverPayouts.status, "draft")),
    );
  const released = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.serverPayouts)
    .where(
      and(
        eq(schema.serverPayouts.weekStart, week.start),
        or(eq(schema.serverPayouts.status, "released"), eq(schema.serverPayouts.status, "paid")),
      ),
    );

  const pendingRedemptions = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.redemptions)
    .where(eq(schema.redemptions.status, "pending"));

  const nextAnnounced = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.challenges)
    .where(
      and(eq(schema.challenges.startAt, nextWeek), eq(schema.challenges.state, "announced")),
    );
  const nextUnpaid = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.challenges)
    .where(
      and(
        eq(schema.challenges.startAt, nextWeek),
        or(
          eq(schema.challenges.state, "draft"),
          eq(schema.challenges.state, "pending_payment"),
        ),
      ),
    );

  const vault = await checkPrizeVault(db);
  const orphans = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.userTrophies)
    .where(and(isNull(schema.userTrophies.redeemedAt), isNull(schema.userTrophies.sweptAt)));

  return [
    {
      key: "close",
      title: "Every challenge from this week is closed",
      done: (stillLive[0]?.n ?? 0) === 0,
      detail:
        (stillLive[0]?.n ?? 0) === 0
          ? `${closed[0]?.n ?? 0} closed, nothing still running past its end.`
          : `${stillLive[0]?.n} still live past their end. Run the close.`,
    },
    {
      key: "allocate",
      title: "This week's pool is allocated",
      done: poolCents > 0,
      detail:
        poolCents > 0
          ? `${formatMoney(poolCents)} allocated.`
          : "Nothing allocated yet. Nothing auto-allocates — a quiet week must still pay owners.",
    },
    {
      key: "payouts",
      title: "Owner payouts released",
      done: (drafts[0]?.n ?? 0) === 0 && (released[0]?.n ?? 0) > 0,
      detail:
        (drafts[0]?.n ?? 0) > 0
          ? `${drafts[0].n} still in draft. A job computes; a human releases.`
          : `${released[0]?.n ?? 0} released.`,
    },
    {
      key: "redemptions",
      title: "Redemption queue cleared",
      done: (pendingRedemptions[0]?.n ?? 0) === 0,
      detail:
        (pendingRedemptions[0]?.n ?? 0) === 0
          ? "Nothing pending a decision."
          : `${pendingRedemptions[0].n} waiting on a decision.`,
    },
    {
      key: "vault",
      title: "Vaults balanced",
      done: vault.holds,
      detail: vault.explanation,
    },
    {
      key: "next-week-paid",
      title: "Next week's challenges are paid",
      done: (nextUnpaid[0]?.n ?? 0) === 0,
      detail:
        (nextUnpaid[0]?.n ?? 0) === 0
          ? "Everything for next week is paid."
          : `${nextUnpaid[0].n} unpaid. Saturday evening is the deadline — a challenge unpaid ` +
            `by then cannot start Monday.`,
    },
    {
      key: "next-week-announced",
      title: "Next week's challenges are announced",
      done: (nextAnnounced[0]?.n ?? 0) > 0,
      detail:
        (nextAnnounced[0]?.n ?? 0) > 0
          ? `${nextAnnounced[0].n} announced, gathering entrants before the gun.`
          : "Nothing announced for next week yet.",
    },
    {
      key: "sweep-check",
      title: "Orphaned and expired trophies reviewed",
      done: vault.orphanedCents === 0,
      detail:
        vault.orphanedCents === 0
          ? `${orphans[0]?.n ?? 0} live holdings, none orphaned.`
          : `${formatMoney(vault.orphanedCents)} held for deleted accounts. Sweep it so the ` +
            `balance equals live liability again.`,
    },
  ];
}

/** V4 — search the prize vault by gamer name. */
export async function vaultSearch(db: DB, query: string) {
  const like = `%${query.toLowerCase()}%`;
  return db
    .select({
      user: schema.users,
      holding: schema.userTrophies,
      trophy: schema.trophies,
      redemption: schema.redemptions,
    })
    .from(schema.userTrophies)
    .innerJoin(schema.users, eq(schema.userTrophies.userId, schema.users.id))
    .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
    .leftJoin(schema.redemptions, eq(schema.redemptions.userTrophyId, schema.userTrophies.id))
    .where(sql`lower(${schema.users.displayName}) like ${like}`)
    .orderBy(desc(schema.trophies.valueCents));
}
