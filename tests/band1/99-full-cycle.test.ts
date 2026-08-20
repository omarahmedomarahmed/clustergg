// Stage 10 — the full-cycle simulation.
//
// Four weeks, end to end, with real money: brands buy, admin announces, gamers
// join and play, Friday closes, trophies land, the pool divides, owners are
// paid, a gamer cashes out. docs/09-TEST-PLAN.md's fixture, compressed.
//
// ===== WHAT THIS PROVES THAT THE UNIT SUITES CANNOT =====
//
// Every other suite exercises one rule against a fixture built for it. This
// one runs the whole loop and asserts the invariants **at every step of the
// four weeks** — which is requirement 4 of "what done means":
//
//     "The prize-vault invariant holds at every step of the four-week
//      simulation."
//
// It is also the second angle on baselining that the mutation harness asks
// for. The unit suite proves the rule; this proves that a week actually scored
// through it comes out right, which is a different claim and fails for
// different reasons.

import { ok, eq, no } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema, type DB } from "../../lib/db/index.ts";
import { createGamer, setAgeBand, setCountry } from "../../lib/identity/gamers.ts";
import { linkAccount } from "../../lib/identity/accounts.ts";
import { signUpBrand, confirmAndPay, onInvoicePaid, brandReport } from "../../lib/portal/brand.ts";
import { createTrophy } from "../../lib/trophies/trophies.ts";
import { announce } from "../../lib/challenges/lifecycle.ts";
import { enterChallenge } from "../../lib/challenges/entry.ts";
import { stampBaselinesAtGun, closeChallenges } from "../../lib/challenges/jobs.ts";
import { settleChallenge } from "../../lib/trophies/settle.ts";
import { forceSync } from "../../lib/core/sync.ts";
import { closeWeek, poolDivisionFor } from "../../lib/pool/score.ts";
import { allocateToPool, maxAllocationCents } from "../../lib/money/pool.ts";
import { releasePayout, markPayoutPaid, payoutTotal } from "../../lib/money/payouts.ts";
import { checkPrizeVault } from "../../lib/money/prize-vault.ts";
import { balanceOf, ledgerBalances } from "../../lib/money/ledger.ts";
import {
  beginEmailVerification,
  confirmEmailVerification,
  requestRedemption,
  approveRedemption,
  markSent,
  markRedemptionPaid,
} from "../../lib/trophies/redemption.ts";
import { weekStartPlus } from "../../lib/challenges/week.ts";
import { CHALLENGE_PRICE_CENTS, splitOf, formatMoney } from "../../lib/money/amounts.ts";
import { ADAPTERS, type StatsResult } from "../../lib/providers/adapters.ts";
import { PROVIDERS } from "../../lib/providers/registry.ts";
import { uid } from "../../lib/core/utils.ts";
import { eq as sqlEq, and as sqlAnd, gt as sqlGt, sql } from "drizzle-orm";
import { currentRows, weekRecordsFor } from "../../lib/pool/record.ts";

// ── A provider the simulation drives ────────────────────────────────────────

const SIM = "sim-provider";
if (!PROVIDERS.some((p) => p.id === SIM)) {
  PROVIDERS.push({
    id: SIM,
    name: "Sim Game",
    game: "Sim Game",
    glyph: "◆",
    color: "#888",
    authType: "public",
    envVars: [],
    identifierLabel: "Name",
    phase: 1,
    capabilities: [
      { key: "wins", label: "Wins", higherIsBetter: true },
      { key: "matches", label: "Matches", higherIsBetter: true },
    ],
  });
}

/** Per-account stats the simulation moves. */
const stats = new Map<string, { wins: number; matches: number }>();

ADAPTERS[SIM] = {
  async verify() {
    return { ok: true as const, accountId: "a", name: "n" };
  },
  async fetchStats(a): Promise<StatsResult> {
    const s = stats.get(a.providerAccountId) ?? { wins: 0, matches: 0 };
    return {
      ok: true,
      metrics: { wins: { value: s.wins }, matches: { value: s.matches } },
    };
  },
};

const WEEK_ONE = new Date("2026-10-05T00:00:00Z"); // A Monday.
const PRIZE = splitOf(CHALLENGE_PRICE_CENTS).prize;

type Gamer = {
  userId: string;
  accountId: string;
  providerAccountId: string;
  /** Their parent — where they first pressed a bot button (A1). */
  guildId: string;
  /** Where they press Join. Null is a web join (A6). */
  joinGuildId: string | null;
};

async function seed(db: DB): Promise<{ guilds: string[]; gamers: Gamer[]; brandId: string }> {
  const guilds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const guildId = `guild-${i}`;
    guilds.push(guildId);
    await db.insert(schema.guilds).values({
      guildId,
      name: `Server ${i}`,
      slug: `server-${i}`,
      memberCount: 100 * (i + 1),
      // The six-field profile (12 §5). Complete on every server, because this
      // simulation is about money and a server silently dropped by the pool
      // gate would make four weeks of arithmetic pass over an empty run.
      community: `Server ${i} is a real community with a real description.`,
      announceChannelId: `chan-${i}`,
      memberAgeRange: "18-24",
      gamesPlayed: ["Chess"],
      inviteUrl: `https://discord.gg/server-${i}`,
      coverImageUrl: `https://cdn.test/server-${i}.png`,
    });
  }

  const gamers: Gamer[] = [];
  for (let i = 0; i < 20; i++) {
    const guildId = guilds[i % guilds.length];
    const userId = await createGamer(db, {
      displayName: `Gamer ${i}`,
      parentGuildId: guildId,
    });
    // Some are teenagers — they win and hold, and cannot cash out.
    await setAgeBand(db, userId, i % 5 === 0 ? "teen" : "adult");
    await setCountry(db, userId, "GB");

    const providerAccountId = `sim-acct-${i}`;
    const { id: accountId } = await linkAccount(db, {
      userId,
      provider: SIM,
      providerAccountId,
      inGameName: `Gamer${i}`,
      verifiedMethod: "exists",
    });
    stats.set(providerAccountId, { wins: 0, matches: 0 });
    // ===== WHERE THEY WILL PRESS JOIN (A4/A5/A6) =====
    //
    // A third join from a **neighbouring** server, so the ½ + ½ split is
    // exercised by the simulation and not only by its own unit test; one in
    // seven joins from the web with no server context, which A6 credits to the
    // parent in full. The rest join at home, which A5 makes a whole 1.0.
    const joinGuildId =
      i % 7 === 3 ? null : i % 3 === 0 ? guilds[(i + 1) % guilds.length] : guildId;
    gamers.push({ userId, accountId, providerAccountId, guildId, joinGuildId });
  }

  // ===== LINKED MEMBERS WHO NEVER ENTER =====
  //
  // Two things need them. Eligibility is `linked ≥ 10` per server (12 §4), and
  // twenty entrants across four servers is five each — every server would be
  // dropped and four weeks of arithmetic would run over an empty pool. And the
  // conversion KPI is entrants ÷ linked members: with every linked member also
  // an entrant it is pinned at 1.0 for everybody and measures nothing.
  for (const guildId of guilds) {
    for (let i = 0; i < 8; i++) {
      const userId = await createGamer(db, {
        displayName: `${guildId} lurker ${i}`,
        parentGuildId: guildId,
      });
      await linkAccount(db, {
        userId,
        provider: SIM,
        providerAccountId: `sim-lurker-${guildId}-${i}`,
        inGameName: `Lurker${i}`,
        verifiedMethod: "exists",
      });
    }
  }

  const { brandId } = await signUpBrand(db, { name: "Acme", contactEmail: "a@acme.test" });
  return { guilds, gamers, brandId };
}

/**
 * The whole month, as a function — so it can be run **twice**.
 *
 * ===== WHY THIS IS NOT A TEST BODY ANY MORE =====
 *
 * S2/N9 says `guild_snapshots` may not touch the weekly cycle. The per-week
 * check below compares one division with and without a snapshot row, which
 * catches a KPI reading the table. It does not catch a *cumulative* drift —
 * a read that moves a rank in week 2, which moves a payout in week 3, which
 * moves the pool in week 4. Nothing inside a single week can see that.
 *
 * So the month runs twice: once normally, and once with the table **dropped**
 * out of the database entirely. Dropped rather than emptied, deliberately —
 * an empty table still answers a query, so an emptied run proves only that
 * the rows are ignored. A dropped one proves nothing in the weekly cycle so
 * much as *asks*, because the query would throw.
 *
 * Every dollar of the two runs is then compared. See `fingerprint`.
 */
async function runTheMonth(
  db: DB,
  opts: { analytics: boolean; label: string },
): Promise<void> {
  const { label } = opts;
  stats.clear();
  const { guilds, gamers, brandId } = await seed(db);

  /** Asserted after every state change, not only at the end. */
  const invariantHolds = async (where: string) => {
    const check = await checkPrizeVault(db);
    ok(
      check.state !== "over_allocated",
      `${where}: the prize vault is never over-allocated — ${check.explanation}`,
    );
    ok(await ledgerBalances(db), `${where}: the ledger balances`);
  };

  await invariantHolds("before anything happens");

  // ── The brand buys a four-week series, once, up front. ────────────────
  const { invoiceId, challengeIds } = await confirmAndPay(
    db,
    { brandId, games: [SIM], challengesPerGame: 1, startingWeek: WEEK_ONE, weeks: 4 },
    new Date("2026-09-28T12:00:00Z"),
  );
  eq(challengeIds.length, 4, `${label}: four challenges, one a week`);
  await invariantHolds("after the bill is issued and before it is paid");
  eq(await balanceOf(db, "prize"), 0, `${label}: an unpaid bill has reached no vault`);

  await onInvoicePaid(db, invoiceId);
  eq(
    await balanceOf(db, "prize"),
    PRIZE * 4,
    `${label}: and paying it backs all four prize pools at once`,
  );
  await invariantHolds("after payment");

  const totalsByWeek: number[] = [];
  let redeemableHolding: string | null = null;

  for (const [index, challengeId] of challengeIds.entries()) {
    const weekStart = weekStartPlus(WEEK_ONE, index);
    const gun = weekStart;
    const close = new Date(weekStart.getTime() + 4 * 86_400_000);
    const where = `${label} week ${index + 1}`;

    // ── Admin sets it up and announces it. A5: confirm the game and the
    //    metrics, assign trophies, then announce. The builder deliberately
    //    leaves metrics unset — a brand does not choose how a challenge
    //    scores — and the readiness guard refuses to announce without them,
    //    which is how this simulation found out it had skipped the step.
    await db
      .update(schema.challenges)
      .set({ metrics: { wins: 10, matches: 1 } })
      .where(sqlEq(schema.challenges.id, challengeId));

    await createTrophy(db, {
      type: "podium",
      name: `Acme Champion — week ${index + 1}`,
      valueCents: PRIZE,
      brandId,
      challengeId,
      place: 1,
    });
    await announce(db, challengeId, "admin-1", guilds);
    await invariantHolds(`${where}: after announcing`);

    // ── Gamers join. Half before the gun, half on day two — so the two
    //    baselining cases both run every week.
    const early = gamers.slice(0, 10);
    const late = gamers.slice(10);

    for (const g of early) {
      const result = await enterChallenge(
        db,
        { challengeId, userId: g.userId, guildId: g.joinGuildId },
        new Date(weekStart.getTime() - 2 * 86_400_000),
      );
      ok(result.ok, `${where}: an early joiner is in`);
      no(result.ok && result.baselineStamped, `${where}: and waits for the gun`);
    }

    // Everybody plays over the weekend before the week. None of it may count.
    for (const g of gamers) {
      const s = stats.get(g.providerAccountId)!;
      s.wins += 5;
      s.matches += 12;
    }

    await stampBaselinesAtGun(db, gun);
    await invariantHolds(`${where}: after the gun`);

    // Day 1 of real competition.
    const dayOne = new Date(gun.getTime() + 86_400_000);
    for (const [i, g] of gamers.entries()) {
      const s = stats.get(g.providerAccountId)!;
      s.wins += i % 7;
      s.matches += (i % 7) + 2;
      await forceSync(db, g.accountId, { at: dayOne });
    }

    // The late half joins on day two, having already played days 1 and 2.
    const dayTwo = new Date(gun.getTime() + 2 * 86_400_000);
    for (const g of late) {
      const result = await enterChallenge(
        db,
        { challengeId, userId: g.userId, guildId: g.joinGuildId },
        dayTwo,
      );
      ok(result.ok, `${where}: a day-two joiner is in`);
      ok(result.ok && result.baselineStamped, `${where}: and baselines now, not at the gun`);
    }

    // The rest of the week.
    for (const [i, g] of gamers.entries()) {
      const s = stats.get(g.providerAccountId)!;
      s.wins += 3 + (i % 5);
      s.matches += 8 + (i % 5);
      await forceSync(db, g.accountId, { at: new Date(gun.getTime() + 3 * 86_400_000) });
    }

    // ── Friday: close, place, settle.
    const closed = await closeChallenges(db, new Date(close.getTime() + 1000));
    eq(closed.closed, [challengeId], `${where}: the challenge closed`);
    await invariantHolds(`${where}: after the close`);

    const settled = await settleChallenge(db, challengeId, { actorId: "admin-1", at: close });
    eq(settled.podium, 1, `${where}: one podium trophy awarded`);
    eq(settled.participation, gamers.length - 1, `${where}: everybody else gets the collectable`);
    await invariantHolds(`${where}: after trophies are awarded`);

    // ===== THE BASELINE ASSERTION, FROM THE OTHER END =====
    //
    // Every entrant played exactly the same amount before the gun. If the
    // baseline were taken at join rather than at max(start, join), the early
    // half would carry that pre-week play into their score and out-place the
    // late half every time. Their scores must be decided by what they did
    // inside the window and nothing else.
    const standings = await db
      .select()
      .from(schema.challengeParticipants)
      .where(sqlEq(schema.challengeParticipants.challengeId, challengeId));
    ok(
      standings.every((p) => p.baselineAt !== null),
      `${where}: every entrant has a baseline`,
    );
    ok(
      standings.every((p) => p.baselineAt!.getTime() >= gun.getTime()),
      `${where}: and not one of them is dated before the gun — check 6 in the data model`,
    );
    ok(
      standings.some((p) => p.baselineAt!.getTime() > gun.getTime()),
      `${where}: while the day-two joiners are dated at their join, not at the gun`,
    );

    // ── Saturday: the pool.
    const poolCents = maxAllocationCents(await balanceOf(db, "server"));
    if (poolCents > 0) {
      await allocateToPool(db, { weekStart, amountCents: poolCents });

      // ===== S2 / N9 — DROP THE TABLE AND EVERY DOLLAR IS IDENTICAL =====
      //
      // `guild_snapshots` is consent-gated analytics an owner opted into and
      // could have declined, refreshed by a button they press. Nothing in the
      // weekly cycle may read it, or a server changes its own earnings by
      // pressing refresh and a revocable permission becomes load-bearing on
      // the pool.
      //
      // Asserted here as well as in its own unit test because the mutation
      // "let a KPI read a guild_snapshots row" was caught by exactly one
      // suite, and one assertion is one edit away from none. This is the
      // division a real week's money is drafted from.
      //
      // One server gets a row and the others do not — the realistic shape,
      // since the grant is per server (N1), and the only one where a read
      // moves money *between* servers rather than cancelling out in the rank.
      if (opts.analytics) {
        const clean = await poolDivisionFor(db, weekStart, close);
        await db.insert(schema.guildSnapshots).values({
          id: uid(),
          guildId: guilds[0],
          takenAt: weekStart,
          memberCount: 999_999,
          linkedCount: 1,
        });
        const withAnalytics = await poolDivisionFor(db, weekStart, close);
        eq(
          JSON.stringify(withAnalytics),
          JSON.stringify(clean),
          `${where}: the whole division is identical with an analytics snapshot present`,
        );
        await db
          .delete(schema.guildSnapshots)
          .where(sqlEq(schema.guildSnapshots.guildId, guilds[0]));
      }

      const { division } = await closeWeek(db, weekStart, close);

      const allocated = division.shares.reduce((sum, s) => sum + s.totalCents, 0);
      eq(allocated, poolCents, `${where}: every cent of the pool is allocated`);
      ok(division.shares.length > 0, `${where}: servers earned something`);

      // Shares can never sum past the true entrant count.
      const entrantTotal = division.shares.reduce((sum, s) => sum + s.entrants, 0);
      ok(
        entrantTotal <= gamers.length + 0.0001,
        `${where}: split shares sum to ${entrantTotal.toFixed(2)}, not past ${gamers.length}`,
      );

      // ── Owners are paid. A human releases; nothing moved on its own.
      const payouts = await db
        .select()
        .from(schema.serverPayouts)
        .where(sqlEq(schema.serverPayouts.weekStart, weekStart));
      ok(
        payouts.every((p) => p.status === "draft"),
        `${where}: payouts open as drafts`,
      );
      for (const p of payouts) {
        await releasePayout(db, p.id, "admin-1");
        await markPayoutPaid(db, p.id, "admin-1");
      }
      totalsByWeek.push(
        (await Promise.all(payouts.map((p) => payoutTotal(db, p.id)))).reduce((a, b) => a + b, 0),
      );

      // ===== THE RECORD IS READ BACK, NOT RECOMPUTED (05 §6 RULE 3) =====
      //
      // Read through `weekRecordsFor` — the same function the admin week
      // pages and the Saturday standings card call — and compared with the
      // payout that was actually drafted against it. These are the same money
      // twice: the record is a copy of the division the close made, and the
      // payout is drawn from that division too.
      //
      // 09's own reason for wanting a second suite on this. The unit suite
      // proves the reader returns what was written into a fixture. This
      // proves that a month's worth of real closes still reads back as the
      // money that left the vault — and a reader that quietly derived a share
      // instead of returning it would have to derive the *same* share every
      // week of four to survive here.
      const recorded = await weekRecordsFor(db, weekStart);
      ok(recorded.length > 0, `${where}: the week reads back out of the record`);
      for (const p of payouts) {
        const row = recorded.find((r) => r.guildId === p.guildId);
        ok(row !== undefined, `${where}: ${p.guildId} was paid, so it has a recorded row`);
        eq(
          row!.totalCents,
          await payoutTotal(db, p.id),
          `${where}: ${p.guildId}'s recorded share is the money it was actually paid`,
        );
      }

      await invariantHolds(`${where}: after owner payouts`);
    }

    // Keep one adult's money-trophy for the redemption at the end.
    if (!redeemableHolding) {
      const [holding] = await db
        .select({ holding: schema.userTrophies, trophy: schema.trophies, user: schema.users })
        .from(schema.userTrophies)
        .innerJoin(schema.trophies, sqlEq(schema.userTrophies.trophyId, schema.trophies.id))
        .innerJoin(schema.users, sqlEq(schema.userTrophies.userId, schema.users.id))
        .where(
          sqlAnd(
            sqlEq(schema.users.ageBand, "adult"),
            sqlGt(schema.trophies.valueCents, 0),
          ),
        );
      if (holding) redeemableHolding = holding.holding.id;
    }
  }

  // ── The month, checked. ───────────────────────────────────────────────

  eq(totalsByWeek.length, 4, `${label}: owners were paid in all four weeks`);
  ok(
    totalsByWeek.every((t) => t > 0),
    `${label}: and every week paid something — a quiet week must still pay owners`,
  );

  const paidOut = totalsByWeek.reduce((a, b) => a + b, 0);
  const held = await balanceOf(db, "server");
  eq(
    paidOut + held,
    splitOf(CHALLENGE_PRICE_CENTS * 4).server,
    `paid ${formatMoney(paidOut)} plus held ${formatMoney(held)} is exactly the server share`,
  );
  ok(held > 0, `${label}: and something is always held back for a refund or a quiet week`);

  // ── A gamer cashes out. ───────────────────────────────────────────────
  ok(redeemableHolding !== null, `${label}: an adult holds a money-trophy`);
  const [holding] = await db
    .select()
    .from(schema.userTrophies)
    .where(sqlEq(schema.userTrophies.id, redeemableHolding as string));

  const prizeBefore = await balanceOf(db, "prize");
  const code = await beginEmailVerification(db, holding.userId, "winner@example.com");
  ok((await confirmEmailVerification(db, holding.userId, code)).ok, `${label}: email verified at redemption`);

  const redemptionId = await requestRedemption(db, {
    userTrophyId: holding.id,
    userId: holding.userId,
    method: "bank",
  });
  await approveRedemption(db, redemptionId, "admin-1");
  await markSent(db, redemptionId, "admin-1", "provider-ref");
  await markRedemptionPaid(db, redemptionId, "admin-1");

  eq(
    await balanceOf(db, "prize"),
    prizeBefore - PRIZE,
    `${label}: the prize vault falls by exactly the trophy's value`,
  );
  await invariantHolds("after a redemption");

  // ── And the brand's report. ───────────────────────────────────────────
  const report = await brandReport(db, brandId);
  eq(report.length, 4, `${label}: a row per week of the series`);
  ok(
    report.every((r) => r.entrants === gamers.length),
    `${label}: every week's entrants counted separately — the same gamer four weeks running is four entrants`,
  );
  ok(report.every((r) => r.reach > 0), `${label}: and reach counted per challenge`);

  const finalCheck = await checkPrizeVault(db);
  // ===== M3 ITSELF, NOT A LIST OF ACCEPTABLE STATES =====
  //
  // This read `state === "green" || state === "unclaimed"` and called that
  // "healthy". It was falsifiable, so not dead — but it was weaker than the
  // code deserves: after four closed weeks nothing should be *unclaimed*, and
  // permitting it meant the assertion would have stayed green through a month
  // that ended with trophies promised to a challenge that never closed.
  //
  // `holds` is the rule stated once: balance − liability − orphaned is zero
  // and the vault is not over-allocated. It is true here, so the weaker form
  // was buying nothing.
  ok(
    finalCheck.holds,
    `${label}: the month ends with the prize vault holding exactly its liability — ` +
      `balance ${finalCheck.balanceCents}, liability ${finalCheck.liabilityCents}, ` +
      `orphaned ${finalCheck.orphanedCents}, state ${finalCheck.state}`,
  );
  eq(finalCheck.state, "green", `${label}: every dollar sits on a gamer's profile`);
}

/**
 * Every dollar the month produced, in a form two runs can be compared by.
 *
 * Ids are random and timestamps are wall-clock, so neither is in here. What is
 * in here is the money and the working that decided it: each week's record row
 * per server — rank, entrants, both KPIs, both share halves, the total — the
 * payout lines those became, the pool allocated, and the four vault balances
 * at the end.
 *
 * Sorted by a stable key rather than by insertion, because two runs insert in
 * whatever order the loops happen to reach and a diff of row *order* is not a
 * diff of money.
 */
async function fingerprint(db: DB): Promise<string> {
  const records = currentRows(await db.select().from(schema.weekRecords));
  const payouts = await db.select().from(schema.serverPayouts);
  const lines = await db.select().from(schema.payoutLines);
  const allocations = await db.select().from(schema.poolAllocations);

  const linesByPayout = new Map<string, typeof lines>();
  for (const line of lines) {
    linesByPayout.set(line.payoutId, [...(linesByPayout.get(line.payoutId) ?? []), line]);
  }

  const key = (a: { k: string }, b: { k: string }) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0);

  return JSON.stringify(
    {
      weeks: records
        .map((r) => ({
          k: `${r.weekStart.toISOString()}|${r.guildId}`,
          guildName: r.guildName,
          eligible: r.eligible,
          ineligibleReason: r.ineligibleReason,
          linkedAtGun: r.linkedAtGun,
          profileCompleteAtGun: r.profileCompleteAtGun,
          rank: r.rank,
          entrants: r.entrants,
          conversion: r.conversion,
          activation: r.activation,
          scoredShareCents: r.scoredShareCents,
          flatShareCents: r.flatShareCents,
          totalCents: r.totalCents,
          poolCents: r.poolCents,
          serversInPool: r.serversInPool,
        }))
        .sort(key),
      payouts: payouts
        .map((p) => ({
          k: `${p.weekStart.toISOString()}|${p.guildId}`,
          status: p.status,
          lines: (linesByPayout.get(p.id) ?? [])
            .map((l) => ({ kind: l.kind, amountCents: l.amountCents }))
            .sort((a, b) => (a.kind < b.kind ? -1 : 1)),
        }))
        .sort(key),
      allocations: allocations
        .map((a) => ({ k: a.weekStart.toISOString(), amountCents: a.amountCents }))
        .sort(key),
      vaults: {
        income: await balanceOf(db, "income"),
        prize: await balanceOf(db, "prize"),
        server: await balanceOf(db, "server"),
        cluster: await balanceOf(db, "cluster"),
      },
    },
    null,
    2,
  );
}

test("four weeks, end to end, with the invariant checked at every step", async () => {
  const db = await resetDemoDb();
  await runTheMonth(db, { analytics: true, label: "the month" });
});

test("the same four weeks with guild_snapshots dropped come out to the identical dollar", async () => {
  // ===== S2 / N9, AT THE SCALE THE RULE IS ACTUALLY ABOUT =====
  //
  // Analytics is consent-gated and revocable (N1). If a single cent of a
  // server's earnings depended on it, an owner would change their own money by
  // pressing a refresh button — and a *different* owner's money too, since the
  // pool is a division and one server's share is every other server's share.
  //
  // The per-week check inside `runTheMonth` compares one division with and
  // without a snapshot row. This compares two whole months, one of which never
  // had the table at all, and the table is **dropped** rather than emptied:
  // an empty table still answers a query, so an emptied month would prove only
  // that the rows are ignored. Any read at all, anywhere in the cycle, makes
  // this run throw rather than differ — which is a better failure than a diff.
  const withAnalytics = await resetDemoDb();
  await runTheMonth(withAnalytics, { analytics: true, label: "with analytics" });
  const withPrints = await fingerprint(withAnalytics);

  const without = await resetDemoDb();
  await without.execute(sql`drop table guild_snapshots`);
  await runTheMonth(without, { analytics: false, label: "with the table dropped" });
  const withoutPrints = await fingerprint(without);

  eq(
    withoutPrints,
    withPrints,
    "four weeks of money are identical with the analytics table dropped out of the database",
  );

  // And the negative half — the comparison must be **capable** of failing, or
  // it is two empty strings agreeing. A month that produced no money would
  // pass the check above and prove nothing at all.
  const parsed = JSON.parse(withPrints) as {
    weeks: { totalCents: number }[];
    payouts: unknown[];
  };
  ok(parsed.weeks.length > 0, "the fingerprint covers a month that actually ran");
  ok(
    parsed.weeks.some((w) => w.totalCents > 0),
    "and one in which servers were actually paid",
  );
  ok(parsed.payouts.length > 0, "with payouts drawn against it");
});
