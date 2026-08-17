// How a weekly pool divides.
//
// ===== ONE FUNCTION, READ BY FIVE SURFACES =====
//
// docs/01-CYCLE.md is explicit: `/pool` shows what each server *would* be paid
// if the week ended now, **computed by the same function that writes Friday's
// placements** — never by a second implementation that could drift. The public
// pool page, the owner portal, the bot's standings card, Saturday's
// announcement and the actual payout all call `dividePool`.
//
// That matters more here than anywhere else on the platform, because the pool
// being public IS the innovation. An owner watching their number climb all
// week and receiving a different one on Saturday would be the end of the only
// thing that makes this model work.
//
// ===== THE THREE KPIs, AND WHY THEY ARE THESE THREE =====
//
//   1. Entrants (40) — volume. **½ parent + ½ join, 1.0 when they are the
//      same.** The split is `lib/identity/attribution.ts`, which is the only
//      place the rule exists, so shares can never sum past the true entrant
//      count (K5).
//   2. Conversion (30) — entrants **whose parent is this server** ÷ linked
//      members **whose parent is this server**. Both sides parent-scoped, both
//      whole gamers, denominator **live**. Efficiency.
//   3. Activation (30) — entrants who scored above zero ÷ entrants. Quality,
//      and the one that kills the fake-entrant attack: a member who joins and
//      never plays *lowers* the ratio.
//
// K1 — **no KPI may measure Discord activity.** Not commands, not card opens,
// not messages. Rewarding activity inside somebody else's product is a
// standing incentive to manufacture it, it was the ToS violation in the old
// model, and all three of these measure outcomes on our own platform instead.
//
// K6 — winning a challenge earns a server nothing directly. Entrants do.
//
// ===== AND ONE TABLE THIS FILE MAY NEVER READ =====
//
// S2/N9 — **nothing in the weekly cycle may read `guild_snapshots`.** Not
// eligibility, not a KPI, not the pool, not a payout. It is consent-gated
// analytics a server owner opted into and could have declined, refreshed by a
// button they press; a dollar that depended on it would let a server change
// its own earnings by pressing refresh, and would make a revocable permission
// load-bearing on the pool. Stated falsifiably: **drop the table and every
// dollar is identical.**
//
// It used to be the conversion denominator. S3 deletes that, and the
// denominator is now computed live in `lib/pool/eligibility.ts`.

import { and, eq, inArray, or } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { KPI_WEIGHTS, POOL_FLAT_BPS, POOL_SCORED_BPS, BPS } from "../money/amounts.ts";
import { standingsOf } from "../challenges/scoring.ts";
import { weekFor } from "../challenges/week.ts";
import { entrantCredit } from "../identity/attribution.ts";
import {
  isFrozenEligible,
  linkedMembersOf,
  LINKED_MEMBERS_TO_UNLOCK_POOL,
} from "./eligibility.ts";

export type ServerKpis = {
  guildId: string;
  name: string;
  /** Split volume: ½ parent + ½ join, 1.0 when they are the same server. */
  entrants: number;
  /** Live, parent-scoped. Never a snapshot. */
  linkedMembers: number;
  /** Entrants **parented here** ÷ linked members **parented here**. ≤ 1.0. */
  conversion: number;
  /** entrants who scored above zero ÷ entrants. */
  activation: number;

  // ===== BOTH SIDES OF EVERY RATIO (07, the weekly record) =====
  //
  // A stored ratio nobody can reconstruct is a number an owner has to take on
  // faith. These carry to `week_records` so a closed week's conversion can be
  // **checked**, not merely read — and they are produced here, by the same
  // computation, rather than re-derived by whatever writes the record (W1).
  conversionNumerator: number;
  conversionDenominator: number;
  activationNumerator: number;
  activationDenominator: number;
  /** W6/W7 — the gun's reasons, carried through so the record can copy them. */
  linkedAtGun: number;
  profileCompleteAtGun: boolean;
};

/**
 * One server's credit on one challenge — the breakdown behind KPI 1.
 *
 * W4 — these sum to `ServerKpis.entrants` for that server, or one of them is
 * wrong. Produced beside the total, from the same loop, for exactly that
 * reason: a breakdown computed separately is a breakdown that can disagree.
 */
export type WeekCredit = {
  guildId: string;
  challengeId: string;
  /** Which capacity earned it. `both` is a parent-and-join entrant — A5's 1.0. */
  role: "parent" | "join" | "both";
  entrantsCredited: number;
  /** The head count behind the decimal, so ½ + ½ reads as two people. */
  entrantsWhole: number;
  scoredAboveZero: number;
};

/** A server that carried entrants and was not in the pool. W6 — it still gets a row. */
export type DroppedServer = {
  guildId: string;
  name: string;
  reason: string;
  /** What it would have been credited with, so the row is not merely a refusal. */
  entrants: number;
  linkedAtGun: number;
  profileCompleteAtGun: boolean;
};

export type PoolShare = ServerKpis & {
  /** 0–100, the weighted percentile score. */
  score: number;
  flatCents: number;
  scoredCents: number;
  totalCents: number;
};

export type PoolDivision = {
  weekStart: Date;
  poolCents: number;
  flatPoolCents: number;
  scoredPoolCents: number;
  shares: PoolShare[];
  /** Servers dropped from the run, and why — K7, with W6's working. */
  dropped: DroppedServer[];
  /** Which challenges fed this week's pool. M12 — the page names them. */
  contributingChallengeIds: string[];
  /** W4 — the per-challenge breakdown behind every share. */
  credits: WeekCredit[];
};

/**
 * Gather the three KPIs for a week.
 *
 * C4/K8 — **community challenges never contribute to a weekly pool.** They are
 * excluded here rather than filtered by a caller, because a caller that
 * forgets is a server credited for entrants its own money paid for.
 */
export async function kpisForWeek(
  db: DB,
  weekStart: Date,
  now = new Date(),
): Promise<{
  kpis: ServerKpis[];
  dropped: DroppedServer[];
  challengeIds: string[];
  credits: WeekCredit[];
}> {
  const week = weekFor(weekStart);

  const challenges = await db
    .select()
    .from(schema.challenges)
    .where(
      and(
        eq(schema.challenges.startAt, week.start),
        eq(schema.challenges.visibility, "sponsored"),
        or(
          eq(schema.challenges.state, "announced"),
          eq(schema.challenges.state, "live"),
          eq(schema.challenges.state, "ended"),
        ),
      ),
    );
  const challengeIds = challenges.map((c) => c.id);
  if (challengeIds.length === 0) {
    return { kpis: [], dropped: [], challengeIds: [], credits: [] };
  }

  const participants = await db
    .select()
    .from(schema.challengeParticipants)
    .where(inArray(schema.challengeParticipants.challengeId, challengeIds));

  // Whether each participant scored above zero — the activation numerator.
  const scoredAbove = new Set<string>();
  for (const challengeId of challengeIds) {
    for (const s of await standingsOf(db, challengeId, now)) {
      if (s.points > 0) scoredAbove.add(`${challengeId}:${s.participant.userId}`);
    }
  }

  const guilds = await db.select().from(schema.guilds);
  const guildById = new Map(guilds.map((g) => [g.guildId, g]));

  const entrantShare = new Map<string, number>();
  const activeShare = new Map<string, number>();
  // The conversion numerator and denominator are **whole gamers**, not shares
  // (K2), so they are sets of user ids rather than running totals.
  const parentedEntrants = new Map<string, Set<string>>();
  const creditRows = new Map<string, WeekCredit>();

  for (const p of participants) {
    // ===== THE FROZEN PARENT. P6, AND THE REASON THIS IS NOT A JOIN =====
    //
    // Read from the entry, never from `users.parentGuildId`. A1b: an admin
    // correcting a gamer's parent in week 6 must not silently move week 3's
    // money, and the mechanism is that this path cannot see the live value at
    // all. A null stamp is a real answer, not a missing one — the credit rule
    // (A7) already says a gamer with no parent earns nobody anything.
    const credits = entrantCredit({
      parentGuildId: p.parentGuildIdAtBaseline,
      joinGuildId: p.joinGuildId,
    });
    // W4 — the breakdown is accumulated **in this loop**, from the same
    // credits the totals come from. Computed separately it could disagree
    // with the total it is supposed to explain, and the invariant exists
    // precisely because a breakdown that does not reconcile is worse than none.
    const creditKey = (guildId: string) => `${guildId}\u0000${p.challengeId}`;

    const active = scoredAbove.has(`${p.challengeId}:${p.userId}`);
    // Whether **this entry** actually credited its parent. A running check
    // against `entrantShare` would be wrong: the map already holds credit from
    // earlier entries, so a parent skipped by the removed-bot rule below would
    // still look credited because somebody else's entry put it there.
    let creditedParent = false;

    for (const { guildId, share } of credits) {
      // ===== A9 — A PARENT THAT LOST THE BOT FREEZES =====
      //
      // "Keeps what it earned, gains nothing new." So the test is not "does
      // this guild still have the bot" — that would take away credit already
      // shown to an owner — it is whether this **entry** was frozen before the
      // bot went. An entry attributed after removal earns the server nothing.
      const guild = guildById.get(guildId);
      if (!guild) continue;
      const frozenAt = p.baselineAt ?? p.joinedAt;
      if (guild.removedAt && frozenAt.getTime() >= guild.removedAt.getTime()) continue;

      entrantShare.set(guildId, (entrantShare.get(guildId) ?? 0) + share);
      if (active) activeShare.set(guildId, (activeShare.get(guildId) ?? 0) + share);
      if (guildId === p.parentGuildIdAtBaseline) creditedParent = true;

      const isParent = guildId === p.parentGuildIdAtBaseline;
      const isJoin = guildId === p.joinGuildId;
      const row = creditRows.get(creditKey(guildId)) ?? {
        guildId,
        challengeId: p.challengeId,
        // `both` is A5's case — one server did the acquiring and the
        // converting, and earned a whole entrant rather than two halves.
        role: (isParent && isJoin ? "both" : isParent ? "parent" : "join") as
          | "parent"
          | "join"
          | "both",
        entrantsCredited: 0,
        entrantsWhole: 0,
        scoredAboveZero: 0,
      };
      // A server can be parent on one entrant and join on another within the
      // same challenge. `both` then describes the challenge honestly; a first
      // role that stuck would describe only whichever entrant came first.
      if (row.role !== "both" && ((isParent && row.role === "join") || (isJoin && row.role === "parent"))) {
        row.role = "both";
      }
      row.entrantsCredited += share;
      row.entrantsWhole += 1;
      if (active) row.scoredAboveZero += 1;
      creditRows.set(creditKey(guildId), row);
    }

    // ===== K9 — CONVERSION COUNTS ONLY ENTRANTS PARENTED HERE =====
    //
    // Not the ½ + ½ credit. A server with 10 linked members that converted 20
    // outsiders would otherwise score 2.0 — an unbounded ratio that rewards
    // poaching over recruiting, which is the opposite of what the KPI is for.
    // The join server is paid for that conversion through KPI 1; it does not
    // also get to claim somebody else's member as its own recruit.
    const parent = p.parentGuildIdAtBaseline;
    if (parent && creditedParent) {
      const set = parentedEntrants.get(parent) ?? new Set<string>();
      set.add(p.userId);
      parentedEntrants.set(parent, set);
    }
  }

  const kpis: ServerKpis[] = [];
  const dropped: DroppedServer[] = [];

  for (const guild of guilds) {
    const entrants = entrantShare.get(guild.guildId) ?? 0;
    if (entrants === 0) continue;

    // ===== K7 — DROPPED FROM THE RUN, NOT SCORED ZERO =====
    //
    // Scored zero, an ineligible server would still occupy a percentile
    // position and take money from servers that did the work. Dropped, its
    // entrants are still **recorded** (12 §4) — they simply earn it nothing
    // this week.
    //
    // The test is the **frozen** eligibility, not a live re-read. E3: never
    // re-check mid-week. This is the read that makes that structural, and it
    // is the one guard 15 breaks.
    if (!isFrozenEligible(guild, week.start)) {
      // W6 — **and here is exactly why.** Field by field, from what the gun
      // saw, because by Friday the live numbers have moved and "you were not
      // eligible" with no reason is the answer this whole table exists to
      // stop somebody having to give.
      const linkedAtGun = guild.linkedAtGun ?? 0;
      const profileCompleteAtGun = guild.profileCompleteAtGun ?? false;
      const missing: string[] = [];
      if (linkedAtGun < LINKED_MEMBERS_TO_UNLOCK_POOL) {
        missing.push(
          `${LINKED_MEMBERS_TO_UNLOCK_POOL - linkedAtGun} more linked gamers at the gun ` +
            `(you had ${linkedAtGun} of ${LINKED_MEMBERS_TO_UNLOCK_POOL})`,
        );
      }
      if (!profileCompleteAtGun) missing.push("a complete server profile at the gun");
      if (guild.eligibilityFrozenAt === null) {
        missing.push("this server was not registered when the week started");
      }

      dropped.push({
        guildId: guild.guildId,
        name: guild.name,
        entrants,
        linkedAtGun,
        profileCompleteAtGun,
        reason:
          "Not in this week's pool, so nothing was scored. Missing at Monday's " +
          `gun: ${missing.join("; ")}. The next gun re-checks, and this week's ` +
          "answer is never re-checked (E3).",
      });
      continue;
    }

    // ===== THE CONVERSION DENOMINATOR IS LIVE. E1 =====
    //
    // Frozen at the gun's ten while the numerator grew all week, a server that
    // linked 50 more on Tuesday and got 30 of them to enter would score
    // 30 ÷ 10 = 3.0 — unbounded, and it rewards exactly the poaching K9 exists
    // to stop. Live on both sides it is 30 ÷ 60, and 1.0 is the ceiling.
    const linkedNow = await linkedMembersOf(db, guild.guildId);
    const parented = parentedEntrants.get(guild.guildId) ?? new Set<string>();

    // ===== WHY THE DENOMINATOR IS A MAXIMUM AND NOT A BARE COUNT =====
    //
    // K2 asserts this reading is "the only one bounded at 1.0", and it is —
    // for every gamer who is *both* an entrant parented here and still a live
    // linked member parented here, which is all of them on any ordinary week:
    // entry requires a linked account (entry guard 5) and the parent is the
    // same fact on both sides.
    //
    // Three things the specification permits elsewhere can separate them
    // mid-week: an admin re-parenting a gamer (A8), a gamer deleting their
    // account, and a gamer unlinking the account they entered with (B6). In
    // each case the entry keeps its frozen parent while the live count loses
    // the gamer, and the bare ratio would climb past 1.0.
    //
    // So the denominator is the **complete** live count of gamers parented
    // here who have linked — and an entry frozen to this parent is itself
    // evidence of both facts. That is not an adjustment or a clamp: it is the
    // honest count, and on an ordinary week it is identical to `linkedNow`
    // because the entrants are already inside it.
    const linkedMembers = Math.max(linkedNow, parented.size);
    const active = activeShare.get(guild.guildId) ?? 0;

    kpis.push({
      guildId: guild.guildId,
      name: guild.name,
      entrants,
      linkedMembers,
      // A server with entrants and no linked members at all is a data problem,
      // not a perfect conversion rate. Zero is the honest answer.
      conversion: linkedMembers > 0 ? parented.size / linkedMembers : 0,
      activation: entrants > 0 ? active / entrants : 0,
      conversionNumerator: parented.size,
      conversionDenominator: linkedMembers,
      activationNumerator: active,
      activationDenominator: entrants,
      linkedAtGun: guild.linkedAtGun ?? 0,
      profileCompleteAtGun: guild.profileCompleteAtGun ?? false,
    });
  }

  // W4 — only the credits of servers that were actually scored. A dropped
  // server's credits would sum to a total no `week_records` row carries.
  const scored = new Set(kpis.map((k) => k.guildId));
  const credits = [...creditRows.values()].filter((c) => scored.has(c.guildId));

  return { kpis, dropped, challengeIds, credits };
}

/**
 * Percentile-rank a set of values, 0–100.
 *
 * Ranked rather than absolute, because the KPIs are on different scales — an
 * entrant count and a ratio cannot be added. Ranking also does what K4 asks
 * for: a large server cannot out-mass a small one, because being twice as big
 * is worth one position, not twice the score.
 *
 * With one server the answer is 100: they are top of every list, and the
 * alternative — zero, from `(n-1)` denominators — would pay a lone server
 * nothing for a week it carried alone.
 */
export function percentileRank(values: number[]): number[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [100];
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    // Ties share the midpoint, so two identical servers get identical money.
    const below = sorted.filter((s) => s < v).length;
    const equal = sorted.filter((s) => s === v).length;
    return ((below + (equal - 1) / 2) / (values.length - 1)) * 100;
  });
}

/**
 * Divide a pool. **The one implementation.**
 *
 * Pure, taking the KPIs and the money rather than reading a database, so the
 * live page, the close and the tests all exercise the same arithmetic with no
 * setup between them.
 */
export function dividePool(
  poolCents: number,
  kpis: ServerKpis[],
  weekStart: Date,
  extras: {
    dropped?: DroppedServer[];
    challengeIds?: string[];
    credits?: WeekCredit[];
  } = {},
): PoolDivision {
  const flatPoolCents = Math.floor((poolCents * POOL_FLAT_BPS) / BPS);
  const scoredPoolCents = poolCents - flatPoolCents;

  if (kpis.length === 0) {
    return {
      weekStart,
      poolCents,
      flatPoolCents,
      scoredPoolCents,
      shares: [],
      dropped: extras.dropped ?? [],
      contributingChallengeIds: extras.challengeIds ?? [],
      credits: extras.credits ?? [],
    };
  }

  const entrantRank = percentileRank(kpis.map((k) => k.entrants));
  const conversionRank = percentileRank(kpis.map((k) => k.conversion));
  const activationRank = percentileRank(kpis.map((k) => k.activation));

  const scores = kpis.map(
    (_, i) =>
      (entrantRank[i] * KPI_WEIGHTS.entrants +
        conversionRank[i] * KPI_WEIGHTS.conversion +
        activationRank[i] * KPI_WEIGHTS.activation) /
      100,
  );
  const totalScore = scores.reduce((a, b) => a + b, 0);

  // The flat share: split evenly among every server that carried an entrant.
  // Turning up is worth something — without it a small server that brought two
  // genuine players earns approximately nothing and stops bothering.
  const flatEach = Math.floor(flatPoolCents / kpis.length);

  const shares: PoolShare[] = kpis.map((k, i) => {
    const scoredCents =
      totalScore > 0 ? Math.floor((scoredPoolCents * scores[i]) / totalScore) : 0;
    return {
      ...k,
      score: scores[i],
      flatCents: flatEach,
      scoredCents,
      totalCents: flatEach + scoredCents,
    };
  });

  // ===== THE REMAINDER GOES TO THE TOP SERVER, NOT NOWHERE =====
  //
  // Flooring every share leaves up to a few cents unallocated, and a pool that
  // does not add up to what was allocated is a pool an owner can catch us on.
  // It goes to the highest-scoring server because somebody has to have it and
  // that is the least arbitrary rule available.
  const allocated = shares.reduce((sum, s) => sum + s.totalCents, 0);
  const remainder = poolCents - allocated;
  if (remainder > 0 && shares.length > 0) {
    const top = shares.reduce((best, s) => (s.score > best.score ? s : best), shares[0]);
    top.scoredCents += remainder;
    top.totalCents += remainder;
  }

  shares.sort((a, b) => b.totalCents - a.totalCents || b.score - a.score);

  return {
    weekStart,
    poolCents,
    flatPoolCents,
    scoredPoolCents,
    shares,
    dropped: extras.dropped ?? [],
    contributingChallengeIds: extras.challengeIds ?? [],
    credits: extras.credits ?? [],
  };
}

/**
 * What each server would be paid if the week ended now.
 *
 * This is what `/pool` renders live, and what the weekly close reads on
 * Friday. Same function, same numbers, no second implementation.
 */
export async function poolDivisionFor(
  db: DB,
  weekStart: Date,
  now = new Date(),
): Promise<PoolDivision> {
  const { poolForWeek } = await import("../money/pool.ts");
  const poolCents = await poolForWeek(db, weekStart);
  const { kpis, dropped, challengeIds, credits } = await kpisForWeek(db, weekStart, now);
  return dividePool(poolCents, kpis, weekStart, { dropped, challengeIds, credits });
}

/**
 * The weekly close: turn the division into draft payouts.
 *
 * A3 — drafts. This computes; a human releases. `draftPayout` is idempotent
 * per (guild, week), so running the close twice is safe.
 */
export async function closeWeek(
  db: DB,
  weekStart: Date,
  now = new Date(),
): Promise<{ division: PoolDivision; drafted: number; recorded: number }> {
  const { draftPayout } = await import("../money/payouts.ts");
  const { writeWeekRecord } = await import("./record.ts");
  const division = await poolDivisionFor(db, weekStart, now);

  let drafted = 0;
  const payoutIds = new Map<string, string>();
  for (const share of division.shares) {
    if (share.totalCents <= 0) continue;
    const payoutId = await draftPayout(db, {
      guildId: share.guildId,
      weekStart,
      lines: [
        {
          kind: "flat",
          description: "Flat participation share — carried at least one entrant",
          amountCents: share.flatCents,
        },
        {
          kind: "scored",
          description:
            `Scored share — ${share.entrants.toFixed(1)} entrants, ` +
            `${(share.conversion * 100).toFixed(1)}% conversion, ` +
            `${(share.activation * 100).toFixed(0)}% activation`,
          amountCents: share.scoredCents,
        },
      ],
    });
    if (payoutId) payoutIds.set(share.guildId, payoutId);
    drafted++;
  }

  // ===== W1 / K12 — THE RECORD IS WRITTEN FROM THIS DIVISION =====
  //
  // Not recomputed. `division` is the object `/pool` has been rendering live
  // all week; the record is a copy of it, taken at the close. One function,
  // two callers — and if this line recomputed anything, Thursday's page and
  // Friday's record could disagree about what an owner was told they had
  // earned, which is the one failure the public pool cannot survive.
  //
  // After the payouts, so each row can name the draft it became.
  const names = new Map<string, { title: string; game: string; brandName: string | null }>();
  if (division.contributingChallengeIds.length > 0) {
    const rows = await db
      .select({
        id: schema.challenges.id,
        title: schema.challenges.title,
        game: schema.challenges.game,
        brandName: schema.brands.name,
      })
      .from(schema.challenges)
      .leftJoin(schema.brands, eq(schema.brands.id, schema.challenges.sponsorBrandId))
      .where(inArray(schema.challenges.id, division.contributingChallengeIds));
    for (const r of rows) {
      names.set(r.id, { title: r.title, game: r.game, brandName: r.brandName });
    }
  }
  const record = await writeWeekRecord(db, { division, payoutIds, challengeNames: names }, now);

  return { division, drafted, recorded: record.written };
}

// ===== `snapshotGuilds` IS DELETED, AND THAT IS THE POINT OF THIS SPRINT ====
//
// It wrote a weekly `linkedCount` and `kpisForWeek` read it as the conversion
// denominator. S3 deletes that: **the denominator is computed live**
// (`linkedMembersOf`), and `guild_snapshots` becomes consent-gated analytics
// that **nothing in the weekly cycle may read** (S2/N9).
//
// The job is deleted rather than left writing rows nobody reads, because a
// table still being filled by the weekly cycle is a table the next person
// reasonably assumes the weekly cycle depends on. The falsifiable form of the
// rule is *"drop the table and every dollar is identical"*, and a write is a
// dependency in the direction that matters least and reads worst.
