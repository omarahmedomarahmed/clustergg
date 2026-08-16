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
  type ServerKpis,
} from "../../lib/pool/score.ts";
import { POOL_FLAT_BPS, BPS, CHALLENGE_PRICE_CENTS, formatMoney } from "../../lib/money/amounts.ts";
import { allocateToPool } from "../../lib/money/pool.ts";
import { payoutTotal } from "../../lib/money/payouts.ts";
import { createInvoice, markPaid } from "../../lib/money/invoices.ts";
import { createChallenge, attachInvoice, markScheduled, announce } from "../../lib/challenges/lifecycle.ts";
import { createGamer } from "../../lib/identity/gamers.ts";
import {
  freezeEligibilityAtGun,
  linkedMembersOf,
  LINKED_MEMBERS_TO_UNLOCK_POOL,
} from "../../lib/pool/eligibility.ts";
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

test("entrant credit is half to the parent and half to the join server", async () => {
  // A4/K5 — at most two servers earn from one gamer, and the shares can never
  // sum past the true entrant count.
  const db = await resetDemoDb();
  await seedTwoServers(db);

  const challengeId = await aLiveChallenge(db, ["g1", "g2"]);
  const userId = await createGamer(db, { displayName: "Parented g1, joined g2" });

  // ONE participant row — P4, one entry per gamer per challenge. Both servers
  // come off this row: there is no membership table any more, and there is
  // nothing else the ½ could be read from.
  await anEntry(db, { challengeId, userId, parent: "g1", join: "g2" });

  const { kpis } = await kpisForWeek(db, MONDAY);
  eq(kpis.length, 2, "both servers earn from this entrant");
  near(kpis.find((k) => k.guildId === "g1")!.entrants, 0.5, "the parent gets half");
  near(kpis.find((k) => k.guildId === "g2")!.entrants, 0.5, "the join server gets the other half");
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
      await anEntry(db, {
        challengeId,
        userId,
        parent: guildId,
        join: guildId,
        linkedAccountId: accountId,
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

test("a server that was not ready at the gun is dropped, not scored zero", async () => {
  // K7 — scored zero it would still occupy a percentile position and take
  // money from servers that did the work. The test is **frozen eligibility**
  // now, not a community string: 12 §5 made the profile six fields and 12 §4
  // put the gate at the gun, so "never described itself" is one of two ways to
  // miss it and the drop has to cover both.
  const db = await resetDemoDb();
  await seedTwoServers(db, { eligible: false });
  // g2 never finished its profile, so the gun finds it ineligible.
  await db
    .update(schema.guilds)
    .set({ coverImageUrl: null })
    .where(sqlEq(schema.guilds.guildId, "g2"));
  await freezeEligibilityAtGun(db, MONDAY);

  const challengeId = await aLiveChallenge(db);
  for (const guildId of ["g1", "g2"]) {
    const userId = await createGamer(db, { displayName: `from-${guildId}` });
    await anEntry(db, { challengeId, userId, parent: guildId, join: guildId });
  }

  const { kpis, dropped } = await kpisForWeek(db, MONDAY);
  eq(kpis.length, 1, "only the server that was ready is scored");
  eq(kpis[0].guildId, "g1", "the one that did the work");
  eq(dropped.length, 1, "and the other is reported as dropped");
  ok(/not in the pool when the week started/.test(dropped[0].reason), "with the reason");
  ok(/complete server\s+profile/.test(dropped[0].reason), "and what to do about it");

  const division = dividePool(10_000, kpis, MONDAY);
  eq(
    division.shares[0].totalCents,
    10_000,
    "the whole pool goes to the server that qualified — the dropped one takes no position",
  );
});

test("an ineligible server's entrants are still recorded — they simply earn it nothing", async () => {
  // 12 §4: *"Gamer enters from an ineligible server → Recorded. That server
  // earns nothing this week."* Dropped is not deleted.
  const db = await resetDemoDb();
  await seedTwoServers(db, { eligible: false });
  await db
    .update(schema.guilds)
    .set({ inviteUrl: null })
    .where(sqlEq(schema.guilds.guildId, "g2"));
  await freezeEligibilityAtGun(db, MONDAY);

  const challengeId = await aLiveChallenge(db);
  const userId = await createGamer(db, { displayName: "From an unready server" });
  await anEntry(db, { challengeId, userId, parent: "g2", join: "g2" });

  const rows = await db.select().from(schema.challengeParticipants);
  eq(rows.length, 1, "the entry exists — the gamer entered, and that is a fact");
  const { kpis, dropped } = await kpisForWeek(db, MONDAY);
  eq(kpis.length, 0, "and no server is scored on it this week");
  eq(dropped.map((d) => d.guildId), ["g2"], "the server is told why, rather than silently absent");
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
  await anEntry(db, { challengeId: communityId, userId, parent: "g1", join: "g1" });

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
      await anEntry(db, { challengeId, userId, parent: guildId, join: guildId });
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
  await anEntry(db, { challengeId, userId, parent: "g1", join: "g1" });
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

test("linked members are counted live, parent-scoped, and never from a snapshot", async () => {
  // A3 — the linked member count goes to the **parent** server only. E1 — it
  // is computed live, because a frozen denominator with a growing numerator is
  // how conversion becomes unbounded.
  const db = await resetDemoDb();
  await seedTwoServers(db, { linkedPerGuild: 0, eligible: false });

  await linkGamers(db, "g1", 3);
  // Somebody parented to g1 who never linked anything: not a linked member.
  await createGamer(db, { displayName: "unlinked", parentGuildId: "g1" });
  // And somebody who linked but is parented **elsewhere** — the case that
  // makes this parent-scoped rather than a bare count.
  await linkGamers(db, "g2", 5);

  eq(await linkedMembersOf(db, "g1"), 3, "only gamers parented here, who actually linked");
  eq(await linkedMembersOf(db, "g2"), 5, "and the other server's are the other server's");

  // The denominator moves during the week — that is the whole of E1.
  await linkGamers(db, "g1", 4);
  eq(await linkedMembersOf(db, "g1"), 7, "live: it grows as members link, mid-week");

  // ===== AND THE HALF THAT CAN ACTUALLY GO WRONG =====
  //
  // "Parented here" and "entered from here" are different sets, and counting
  // the second is the plausible mistake — it is the number a server owner
  // would say out loud. Without an entry that separates them, the assertions
  // above are true and cannot fail: there is nothing in the fixture for a
  // join-scoped count to pick up. This is what break 127 found.
  const challengeId = await aLiveChallenge(db, ["g1", "g2"]);
  for (const userId of await linkGamers(db, "g2", 6)) {
    await anEntry(db, { challengeId, userId, parent: "g2", join: "g1" });
  }
  eq(
    await linkedMembersOf(db, "g1"),
    7,
    "six of g2's members entering from g1's card are not g1's linked members — A3",
  );
  eq(await linkedMembersOf(db, "g2"), 11, "they are g2's, because g2 is who recruited them");
});

test("no weekly-cycle dollar reads a guild_snapshots row", async () => {
  // ===== S2 / N9, STATED FALSIFIABLY =====
  //
  // *"Drop the table and every dollar is identical."* `guild_snapshots` is
  // consent-gated analytics a server owner opted into and could have declined,
  // refreshed by a button they press. A dollar that depended on it would let a
  // server change its own earnings by pressing refresh, and would make a
  // revocable permission load-bearing on the pool.
  //
  // This is the sprint-5 half: the pool's numbers with the table full and with
  // it empty. Sprint 7 owns the full four-week version.
  const db = await resetDemoDb();
  await seedTwoServers(db);
  const challengeId = await aLiveChallenge(db, ["g1", "g2"]);
  for (const guildId of ["g1", "g2"]) {
    for (let i = 0; i < 3; i++) {
      const userId = await createGamer(db, {
        displayName: `${guildId}-e${i}`,
        parentGuildId: guildId,
      });
      await anEntry(db, { challengeId, userId, parent: guildId, join: guildId });
    }
  }

  const withoutRows = await poolDivisionFor(db, MONDAY);

  // ===== ONE SERVER OPTED IN AND THE OTHER DID NOT =====
  //
  // That asymmetry is the realistic shape — the grant is per server (N1) — and
  // it is the only shape where reading a snapshot moves money *between*
  // servers. Giving both a row makes any read cancel out in the percentile
  // ranking, which is how the first version of this guard went green on a
  // break that really did read the table.
  await db.insert(schema.guildSnapshots).values({
    id: uid(),
    guildId: "g1",
    weekStart: MONDAY,
    memberCount: 999_999,
    linkedCount: 1,
  });
  const withRows = await poolDivisionFor(db, MONDAY);

  // ===== AND EVERY FIELD, NOT THREE SOMEBODY REMEMBERED =====
  //
  // A hand-picked field list guards the fields somebody thought of, which is
  // the same defect as a hand-maintained file list. The first version compared
  // `totalCents` and `conversion`, and a break that moved `activation` sailed
  // through it.
  eq(
    JSON.stringify(withRows),
    JSON.stringify(withoutRows),
    "the entire division is identical whether the analytics table is full or empty",
  );
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

/**
 * Two servers, both **eligible at the gun**.
 *
 * Eligibility is `linked ≥ 10` and a complete six-field profile, frozen on
 * Monday (12 §4). A fixture that skipped it would put every test in this file
 * behind the K7 drop and they would all assert on an empty run — which is why
 * the linked gamers are real rows rather than a snapshot count: the conversion
 * denominator is live now, and there is nothing left to fake it with.
 */
async function seedTwoServers(
  db: DB,
  opts: { linkedPerGuild?: number; eligible?: boolean } = {},
) {
  const linked = opts.linkedPerGuild ?? LINKED_MEMBERS_TO_UNLOCK_POOL + 2;
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
      memberAgeRange: "18-24",
      gamesPlayed: ["Chess"],
      inviteUrl: `https://discord.gg/${guildId}`,
      coverImageUrl: `https://cdn.test/${guildId}.png`,
      announceChannelId: `chan-${guildId}`,
    });
    await linkGamers(db, guildId, linked);
  }
  if (opts.eligible !== false) await freezeEligibilityAtGun(db, MONDAY);
}

/** `n` gamers whose **parent** is this guild, each with a linked account (A3). */
async function linkGamers(db: DB, guildId: string, n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const userId = await createGamer(db, {
      displayName: `${guildId}-member-${i}`,
      parentGuildId: guildId,
    });
    await db.insert(schema.linkedGameAccounts).values({
      id: uid(),
      userId,
      provider: "chesscom",
      providerAccountId: `${guildId}-acct-${i}-${uid()}`,
      verifiedMethod: "exists",
    });
    ids.push(userId);
  }
  return ids;
}

/**
 * One entry, with both server columns stamped as the platform would stamp
 * them — `joinGuildId` where they pressed Join, `parentGuildIdAtBaseline`
 * frozen beside the baseline (P6).
 */
async function anEntry(
  db: DB,
  input: {
    challengeId: string;
    userId: string;
    parent: string | null;
    join: string | null;
    linkedAccountId?: string;
    baselineAt?: Date;
  },
) {
  await db.insert(schema.challengeParticipants).values({
    id: uid(),
    challengeId: input.challengeId,
    userId: input.userId,
    linkedAccountId: input.linkedAccountId ?? uid(),
    joinGuildId: input.join,
    parentGuildIdAtBaseline: input.parent,
    baselineAt: input.baselineAt ?? MONDAY,
    baseline: { wins: 0, matches: 0 },
  });
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
