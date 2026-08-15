// Stage 7's foundation — how a weekly pool divides.
//
// The property that matters most is not any single number: it is that `/pool`
// and Friday's close call **the same function**. An owner watching their share
// climb all week and receiving a different figure on Saturday would end the
// only thing that makes this model work, and the pool being public is the
// innovation.

import { ok, eq, no, near } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema, type DB } from "../../lib/db/index.ts";
import {
  dividePool,
  percentileRank,
  kpisForWeek,
  poolDivisionFor,
  closeWeek,
  snapshotGuilds,
  type ServerKpis,
} from "../../lib/pool/score.ts";
import { POOL_FLAT_BPS, BPS, CHALLENGE_PRICE_CENTS, formatMoney } from "../../lib/money/amounts.ts";
import { allocateToPool } from "../../lib/money/pool.ts";
import { payoutTotal } from "../../lib/money/payouts.ts";
import { createInvoice, markPaid } from "../../lib/money/invoices.ts";
import { createChallenge, attachInvoice, markScheduled, announce } from "../../lib/challenges/lifecycle.ts";
import { createGamer } from "../../lib/identity/gamers.ts";
import { uid } from "../../lib/core/utils.ts";
import { eq as sqlEq } from "drizzle-orm";

const MONDAY = new Date("2026-09-07T00:00:00Z");

function kpi(over: Partial<ServerKpis> & { guildId: string }): ServerKpis {
  return {
    name: over.guildId,
    entrants: 0,
    linkedMembers: 0,
    conversion: 0,
    activation: 0,
    ...over,
  };
}

// ── The division ────────────────────────────────────────────────────────────

test("a fifth of every pool is split evenly, because turning up is worth something", () => {
  const division = dividePool(
    10_000,
    [
      kpi({ guildId: "big", entrants: 50, conversion: 0.5, activation: 0.9 }),
      kpi({ guildId: "small", entrants: 2, conversion: 0.1, activation: 0.5 }),
    ],
    MONDAY,
  );

  eq(division.flatPoolCents, (10_000 * POOL_FLAT_BPS) / BPS, "20% of the pool is flat");
  eq(
    division.shares[0].flatCents,
    division.shares[1].flatCents,
    "and it is split evenly — the big server and the small one get the same flat share",
  );
  ok(
    division.shares.find((s) => s.guildId === "small")!.totalCents > 0,
    "so a server that brought two genuine players earns something rather than nothing",
  );
});

test("the whole pool is paid out, to the cent", () => {
  for (const poolCents of [10_000, 8_750, 1, 3, 99_991]) {
    for (const n of [1, 2, 3, 7]) {
      const kpis = Array.from({ length: n }, (_, i) =>
        kpi({ guildId: `g${i}`, entrants: i + 1, conversion: (i + 1) / 10, activation: 0.5 }),
      );
      const division = dividePool(poolCents, kpis, MONDAY);
      const paid = division.shares.reduce((sum, s) => sum + s.totalCents, 0);
      eq(paid, poolCents, `${n} servers, ${formatMoney(poolCents)} — every cent allocated`);
    }
  }
});

test("a gamer in two servers is worth half to each", async () => {
  // K5/G2 — shares can never sum past the true entrant count. Without this,
  // ten overlapping servers turn 100 entrants into 1,000 and the pool pays for
  // members that do not exist.
  const db = await resetDemoDb();
  await seedTwoServers(db);

  const challengeId = await aLiveChallenge(db, ["g1", "g2"]);
  const userId = await createGamer(db, { displayName: "In Both" });

  // ONE participant row — P4, one entry per gamer per challenge. The two
  // servers come from membership, which is the only place they can come from.
  await db.insert(schema.challengeParticipants).values({
    id: uid(),
    challengeId,
    userId,
    linkedAccountId: "acct-1",
    guildId: "g1",
    baselineAt: MONDAY,
    baseline: { wins: 0, matches: 0 },
  });
  for (const guildId of ["g1", "g2"]) {
    await db.insert(schema.guildMembers).values({ id: uid(), guildId, userId });
  }

  const { kpis } = await kpisForWeek(db, MONDAY);
  eq(kpis.length, 2, "both servers carried the entrant");
  near(kpis[0].entrants, 0.5, "each gets half of the one gamer");
  near(kpis[1].entrants, 0.5, "and so does the other");
  near(
    kpis[0].entrants + kpis[1].entrants,
    1,
    "so the shares sum to the true entrant count, and never past it",
  );
});

test("an entrant who never plays lowers the server's score", async () => {
  // K3 — the fake-entrant attack. Filling a server with members who join and
  // never play must make its number worse, not better.
  const db = await resetDemoDb();
  await seedTwoServers(db);
  const challengeId = await aLiveChallenge(db);

  // g1: two entrants, one of whom played. g2: two entrants, both played.
  for (const [guildId, playedCount] of [
    ["g1", 1],
    ["g2", 2],
  ] as const) {
    for (let i = 0; i < 2; i++) {
      const userId = await createGamer(db, { displayName: `${guildId}-${i}` });
      const accountId = uid();
      await db.insert(schema.linkedGameAccounts).values({
        id: accountId,
        userId,
        provider: "chesscom",
        providerAccountId: `${guildId}-${i}`,
        verifiedMethod: "exists",
      });
      await db.insert(schema.challengeParticipants).values({
        id: uid(),
        challengeId,
        userId,
        linkedAccountId: accountId,
        guildId,
        baselineAt: MONDAY,
        baseline: { wins: 0, matches: 0 },
      });
      if (i < playedCount) {
        await db.insert(schema.observations).values({
          id: uid(),
          linkedAccountId: accountId,
          provider: "chesscom",
          metricKey: "wins",
          value: 5,
          observedAt: new Date("2026-09-08T00:00:00Z"),
        });
      }
    }
  }

  const { kpis } = await kpisForWeek(db, MONDAY, new Date("2026-09-09T00:00:00Z"));
  const g1 = kpis.find((k) => k.guildId === "g1")!;
  const g2 = kpis.find((k) => k.guildId === "g2")!;
  near(g1.entrants, 2, "both servers brought two entrants");
  near(g2.entrants, 2, "the same volume");
  near(g1.activation, 0.5, "but only half of g1's played");
  near(g2.activation, 1, "and all of g2's did");

  const division = dividePool(10_000, kpis, MONDAY);
  const g1Share = division.shares.find((s) => s.guildId === "g1")!;
  const g2Share = division.shares.find((s) => s.guildId === "g2")!;
  ok(
    g2Share.totalCents > g1Share.totalCents,
    "so the server whose members actually played is paid more, on identical volume",
  );
});

test("a large server cannot simply out-mass a small one", () => {
  // K4 — all three KPIs are ratios or split volumes, and the scored share is
  // percentile-ranked. Being ten times bigger is worth one position, not ten
  // times the money.
  const division = dividePool(
    100_000,
    [
      kpi({ guildId: "huge", entrants: 1_000, conversion: 0.01, activation: 0.2 }),
      kpi({ guildId: "tiny", entrants: 10, conversion: 0.9, activation: 0.95 }),
    ],
    MONDAY,
  );
  const huge = division.shares.find((s) => s.guildId === "huge")!;
  const tiny = division.shares.find((s) => s.guildId === "tiny")!;
  ok(
    tiny.totalCents > huge.totalCents,
    "a hundred times smaller and far better converted wins — outcomes, not mass",
  );
});

test("a server that never described itself is dropped, not scored zero", async () => {
  // K7 — scored zero it would still occupy a percentile position and take
  // money from servers that did the work.
  const db = await resetDemoDb();
  await seedTwoServers(db);
  await db
    .update(schema.guilds)
    .set({ community: null })
    .where(sqlEq(schema.guilds.guildId, "g2"));

  const challengeId = await aLiveChallenge(db);
  for (const guildId of ["g1", "g2"]) {
    const userId = await createGamer(db, { displayName: `from-${guildId}` });
    await db.insert(schema.challengeParticipants).values({
      id: uid(),
      challengeId,
      userId,
      linkedAccountId: uid(),
      guildId,
      baselineAt: MONDAY,
      baseline: {},
    });
  }

  const { kpis, dropped } = await kpisForWeek(db, MONDAY);
  eq(kpis.length, 1, "only the described server is scored");
  eq(kpis[0].guildId, "g1", "the one that did the work");
  eq(dropped.length, 1, "and the other is reported as dropped");
  ok(/community profile/.test(dropped[0].reason), "with what to do about it");

  const division = dividePool(10_000, kpis, MONDAY);
  eq(
    division.shares[0].totalCents,
    10_000,
    "the whole pool goes to the server that qualified — the dropped one takes no position",
  );
});

test("a community challenge contributes nothing to the pool", async () => {
  // C4/K8. Paying an owner from a pool their own money funded would pay them
  // twice, so their challenge's entrants must not count.
  const db = await resetDemoDb();
  await seedTwoServers(db);

  const communityId = await createChallenge(db, {
    title: "Nightfall's own",
    game: "Chess",
    provider: "chesscom",
    startAt: MONDAY,
    visibility: "community",
    guildId: "g1",
    metrics: { wins: 10 },
  });
  const invoiceId = await createInvoice(db, {
    payerType: "guild",
    lines: [{ description: "Tier 1", amountCents: 500 }],
  });
  await attachInvoice(db, communityId, invoiceId);
  await markPaid(db, invoiceId, { communityTier: 1 });
  await markScheduled(db, communityId);
  // ANNOUNCED, deliberately. Leaving it merely scheduled would let the
  // state filter exclude it and the visibility filter go untested — which is
  // exactly what happened the first time this was broken: deleting the
  // "sponsored" condition was caught by nothing.
  await announce(db, communityId, "admin-1", ["g1"]);

  const userId = await createGamer(db, { displayName: "Community Entrant" });
  await db.insert(schema.challengeParticipants).values({
    id: uid(),
    challengeId: communityId,
    userId,
    linkedAccountId: uid(),
    guildId: "g1",
    baselineAt: MONDAY,
    baseline: {},
  });

  const { kpis, challengeIds } = await kpisForWeek(db, MONDAY);
  eq(
    challengeIds.length,
    0,
    "an announced, live, paid community challenge is still not a contributor",
  );
  eq(kpis.length, 0, "so its entrant earns its server nothing from the weekly pool");
});

test("percentile ranking handles one server, and ties", () => {
  eq(percentileRank([5]), [100], "a lone server is top of every list, not bottom");
  eq(percentileRank([1, 2, 3]), [0, 50, 100], "three servers spread across the range");
  const ties = percentileRank([4, 4, 8]);
  eq(ties[0], ties[1], "two identical servers rank identically, so they are paid identically");
  eq(ties[2], 100, "and the better one is still on top");
});

// ── The one-function rule ───────────────────────────────────────────────────

test("the live pool page and Friday's close are the same function", async () => {
  const db = await resetDemoDb();
  await seedTwoServers(db);
  const challengeId = await aLiveChallenge(db);

  for (const guildId of ["g1", "g2"]) {
    for (let i = 0; i < 3; i++) {
      const userId = await createGamer(db, { displayName: `${guildId}-p${i}` });
      await db.insert(schema.challengeParticipants).values({
        id: uid(),
        challengeId,
        userId,
        linkedAccountId: uid(),
        guildId,
        baselineAt: MONDAY,
        baseline: {},
      });
    }
  }

  // Fund vault 3 and allocate.
  for (let i = 0; i < 2; i++) {
    const invoiceId = await createInvoice(db, {
      payerType: "brand",
      lines: [{ description: `c${i}`, amountCents: CHALLENGE_PRICE_CENTS }],
    });
    await markPaid(db, invoiceId);
  }
  await allocateToPool(db, { weekStart: MONDAY, amountCents: 8_750 });

  const live = await poolDivisionFor(db, MONDAY, new Date("2026-09-09T00:00:00Z"));
  const closed = await closeWeek(db, MONDAY, new Date("2026-09-09T00:00:00Z"));

  eq(
    closed.division.shares.map((s) => `${s.guildId}:${s.totalCents}`),
    live.shares.map((s) => `${s.guildId}:${s.totalCents}`),
    "what /pool showed on Wednesday is what the close writes — the same function, not a second one",
  );

  eq(closed.drafted, 2, "two payouts drafted");
  const payouts = await db.select().from(schema.serverPayouts);
  ok(payouts.every((p) => p.status === "draft"), "as drafts — a job computes, a human releases");

  for (const payout of payouts) {
    const share = live.shares.find((s) => s.guildId === payout.guildId)!;
    eq(
      await payoutTotal(db, payout.id),
      share.totalCents,
      "and each payout's lines add up to exactly what the page promised",
    );
  }
});

test("re-running the close does not double a payout", async () => {
  const db = await resetDemoDb();
  await seedTwoServers(db);
  const challengeId = await aLiveChallenge(db);
  const userId = await createGamer(db, { displayName: "Only Entrant" });
  await db.insert(schema.challengeParticipants).values({
    id: uid(),
    challengeId,
    userId,
    linkedAccountId: uid(),
    guildId: "g1",
    baselineAt: MONDAY,
    baseline: {},
  });
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "c", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await markPaid(db, invoiceId);
  await allocateToPool(db, { weekStart: MONDAY, amountCents: 4_000 });

  await closeWeek(db, MONDAY);
  await closeWeek(db, MONDAY);

  const payouts = await db.select().from(schema.serverPayouts);
  eq(payouts.length, 1, "one server, one week, one payout — however many times it runs");
  eq(await payoutTotal(db, payouts[0].id), 4_000, "at the right amount");
});

test("the snapshot counts linked members, which is the conversion denominator", async () => {
  const db = await resetDemoDb();
  await seedTwoServers(db, { snapshots: false });

  for (let i = 0; i < 3; i++) {
    const userId = await createGamer(db, {
      displayName: `linked-${i}`,
      attributedGuildId: "g1",
    });
    await db.insert(schema.linkedGameAccounts).values({
      id: uid(),
      userId,
      provider: "chesscom",
      providerAccountId: `p${i}`,
      verifiedMethod: "exists",
    });
  }
  // Somebody attributed to g1 who never linked anything.
  await createGamer(db, { displayName: "unlinked", attributedGuildId: "g1" });

  await snapshotGuilds(db, MONDAY);
  const [snapshot] = await db
    .select()
    .from(schema.guildSnapshots)
    .where(sqlEq(schema.guildSnapshots.guildId, "g1"));
  eq(snapshot.linkedCount, 3, "only members who actually linked an account count");
});

test("no KPI measures Discord activity", async () => {
  // K1 — this is the line the old model crossed. The check is structural: the
  // scoring module must not reference anything Discord-shaped, because a KPI
  // that counts commands or messages is a standing incentive to manufacture
  // them inside somebody else's product.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const repoRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
  const src = await fs.readFile(path.join(repoRoot, "lib", "pool", "score.ts"), "utf8");

  const forbidden = ["messageCount", "commandCount", "cardOpens", "discordPostQueue", "messagesSent"];
  const found = forbidden.filter((f) => new RegExp(`\\b${f}\\b`).test(src));
  eq(found, [], "the pool scorer reads nothing that measures activity inside Discord");
  ok(
    /entrants/.test(src) && /conversion/.test(src) && /activation/.test(src),
    "it reads outcomes on our own platform instead",
  );
});

// ── Fixtures ────────────────────────────────────────────────────────────────

async function seedTwoServers(db: DB, opts: { snapshots?: boolean } = {}) {
  for (const [guildId, name] of [
    ["g1", "Nightfall"],
    ["g2", "Dawnbreak"],
  ]) {
    await db.insert(schema.guilds).values({
      guildId,
      name,
      slug: name.toLowerCase(),
      memberCount: 500,
      community: `${name} is a competitive gaming community.`,
    });
    if (opts.snapshots !== false) {
      await db.insert(schema.guildSnapshots).values({
        id: uid(),
        guildId,
        weekStart: MONDAY,
        memberCount: 500,
        linkedCount: 20,
      });
    }
  }
}

async function aLiveChallenge(db: DB, announceTo: string[] = []): Promise<string> {
  const challengeId = await createChallenge(db, {
    title: "Weekly",
    game: "Chess",
    provider: "chesscom",
    startAt: MONDAY,
    metrics: { wins: 10, matches: 1 },
  });
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "Challenge", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await attachInvoice(db, challengeId, invoiceId);
  await markPaid(db, invoiceId);
  await markScheduled(db, challengeId);
  await announce(db, challengeId, "admin-1", announceTo);
  return challengeId;
}
