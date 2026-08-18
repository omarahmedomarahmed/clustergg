// The weekly record — 07's `week_records` / `week_credits`, W1 to W7.
//
// ===== WHAT THIS TABLE IS FOR, IN ONE SENTENCE =====
//
// *"You earned nothing and here is exactly why"*, answerable in month nine
// about week three — when every input the answer depended on has moved.
//
// The number always survived: `server_payouts` keeps what a server was paid.
// The **working** did not, and a disputed payout is precisely the moment
// somebody needs the working, because the total is the one thing not in
// dispute.

import { ok, eq, no, near, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema, type DB } from "../../lib/db/index.ts";
import {
  currentRows,
  reconcileCredits,
  RecordRefused,
  superseded,
  weekCreditsFor,
  weekRecordsFor,
  weekRecordsForGuild,
  weekSummaries,
} from "../../lib/pool/record.ts";
import { closeWeek } from "../../lib/pool/score.ts";
import { freezeEligibilityAtGun, LINKED_MEMBERS_TO_UNLOCK_POOL } from "../../lib/pool/eligibility.ts";
import { allocateToPool } from "../../lib/money/pool.ts";
import { createInvoice, markPaid } from "../../lib/money/invoices.ts";
import {
  createChallenge,
  attachInvoice,
  markScheduled,
  announce,
} from "../../lib/challenges/lifecycle.ts";
import { createGamer } from "../../lib/identity/gamers.ts";
import { CHALLENGE_PRICE_CENTS } from "../../lib/money/amounts.ts";
import { uid } from "../../lib/core/utils.ts";
import { eq as sqlEq } from "drizzle-orm";

const WEEK_1 = new Date("2026-09-07T00:00:00Z");
const WEEK_2 = new Date("2026-09-14T00:00:00Z");

// ── W1 · written once, from the same division the pool shows ────────────────

test("the record is written at the close, from the division /pool already showed", async () => {
  // W1 / K12 — **one function, two callers.** If the record recomputed
  // anything, Thursday's page and Friday's record could disagree about what an
  // owner was told they had earned, and the pool being public is the entire
  // innovation.
  const db = await resetDemoDb();
  await aWeek(db, WEEK_1);
  const { division, recorded } = await closeWeek(db, WEEK_1);

  const rows = await weekRecordsFor(db, WEEK_1);
  eq(recorded, rows.length, "a row per server that took part");
  ok(rows.length > 0, "and there are some");

  for (const share of division.shares) {
    const row = rows.find((r) => r.guildId === share.guildId)!;
    eq(row.totalCents, share.totalCents, `${share.guildId}: the money is the division's`);
    eq(row.flatShareCents, share.flatCents, "flat share too");
    eq(row.scoredShareCents, share.scoredCents, "and scored");
    near(row.entrants, share.entrants, "and the entrants it was computed from");
    near(row.conversion, share.conversion, "and the ratio");
    eq(
      row.conversionNumerator,
      share.conversionNumerator,
      "with both sides, so it can be checked rather than taken on faith",
    );
    eq(row.conversionDenominator, share.conversionDenominator, "the denominator too");
  }
});

test("nothing that writes or reads the record computes a pool of its own", async () => {
  // ===== WHY THIS IS STRUCTURAL AND NOT A VALUE COMPARISON =====
  //
  // Break 169 replaced the division with a **recomputation** a day later, and
  // went green — because on a fixture where nothing moved in between, the two
  // agree. That is trap 2 exactly: the assertion was true and could not vary.
  //
  // The property W1/K12 actually states is not "the numbers match today", it
  // is *there is only one implementation*. So it is checked where it can only
  // be true or false: the module that **writes** the record must not compute
  // one, and the pages that **read** it must not either. 05 §6 rule 3 says the
  // same about the pages in the same words — nothing on them is recalculated.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
  const strip = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const writer = strip(await fs.readFile(path.join(repoRoot, "lib", "pool", "record.ts"), "utf8"));
  ok(/writeWeekRecord/.test(writer), "the read reached the writer — an empty read would prove nothing");
  no(
    /poolDivisionFor|kpisForWeek|dividePool/.test(writer),
    "the module that writes the record does not compute one — it is handed the division the close already made",
  );

  const pages = [
    "app/admin/weeks/page.tsx",
    "app/admin/weeks/[weekStart]/page.tsx",
    "app/admin/weeks/[weekStart]/[guildId]/page.tsx",
  ];
  for (const rel of pages) {
    const src = strip(await fs.readFile(path.join(repoRoot, rel), "utf8"));
    ok(/weekRecords|weekSummaries|weekCredits/.test(src), `${rel} reads the record`);
    no(
      /poolDivisionFor|kpisForWeek|dividePool|closeWeek/.test(src),
      `${rel} recalculates nothing — a figure that disagrees is a defect to raise, not a number to recompute`,
    );
  }
});

test("closing twice does not write a second record", async () => {
  // W2 forbids updating a row, so a second write is a **duplicate** — and
  // `Σ totalCents` (W3) would then be double the pool with no edit having
  // happened anywhere. Idempotence here is a correctness rule, not a nicety.
  const db = await resetDemoDb();
  await aWeek(db, WEEK_1);

  const first = await closeWeek(db, WEEK_1);
  const second = await closeWeek(db, WEEK_1);
  ok(first.recorded > 0, "the first close wrote the week");
  eq(second.recorded, 0, "and the second wrote nothing");
  eq(
    (await weekRecordsFor(db, WEEK_1)).length,
    first.recorded,
    "one row per server, however many times the close runs",
  );
});

// ── W3 · the shares add up to the pool ──────────────────────────────────────

test("the shares recorded for a week add up to that week's allocation", async () => {
  const db = await resetDemoDb();
  await aWeek(db, WEEK_1);
  await closeWeek(db, WEEK_1);

  const [summary] = await weekSummaries(db);
  eq(summary.sharesTotalCents, summary.allocatedCents, "W3 — Σ shares equals the pool");
  ok(summary.reconciles, "and the page can say so");
  ok(summary.poolCents > 0, "on a week that actually allocated something");

  // And the negative half: the summary must be **capable** of saying no, or
  // `reconciles` is a constant dressed as a check.
  const [row] = await weekRecordsFor(db, WEEK_1);
  await db
    .update(schema.weekRecords)
    .set({ totalCents: row.totalCents + 1 })
    .where(sqlEq(schema.weekRecords.id, row.id));
  const [after] = await weekSummaries(db);
  no(after.reconciles, "a cent out of place and it says so, rather than quietly recomputing");
});

// ── W4 · the breakdown reconciles to the total ──────────────────────────────

test("a server's per-challenge credits add up to its recorded entrants", async () => {
  // W4. A breakdown that does not reconcile to the total it explains is worse
  // than no breakdown, because it will be believed.
  const db = await resetDemoDb();
  await aWeek(db, WEEK_1);
  await closeWeek(db, WEEK_1);

  const reconciliation = await reconcileCredits(db, WEEK_1);
  ok(reconciliation.length > 0, "there are scored servers to reconcile");
  ok(reconciliation.every((r) => r.ok), "and every one of them adds up");

  // The decimal and the head count answer different questions, and both are
  // needed: two halves read 1.0 over 2 people, a same-server entrant reads 1.0
  // over 1. Without the head count, A4 and A5 are indistinguishable.
  const credits = await weekCreditsFor(db, WEEK_1, "g1");
  ok(credits.length > 0, "g1 was credited on something");
  const halves = credits.find((c) => c.entrantsCredited < c.entrantsWhole);
  ok(
    halves !== undefined,
    "and at least one credit is a half — so the head count is not just the decimal again",
  );
  ok(
    credits.every((c) => c.role === "parent" || c.role === "join" || c.role === "both"),
    "each says in which capacity it earned",
  );
});

// ── W5 · names are copied, not joined ───────────────────────────────────────

test("a server renamed in week 2 still reads as its week-1 name in week 1", async () => {
  // W5. History that rewrites itself when somebody edits a profile is not
  // history — and a renamed server is the single most ordinary thing that can
  // happen between a week closing and somebody asking about it.
  const db = await resetDemoDb();
  await aWeek(db, WEEK_1);
  await closeWeek(db, WEEK_1);

  const before = (await weekRecordsFor(db, WEEK_1)).find((r) => r.guildId === "g1")!;
  eq(before.guildName, "Nightfall", "recorded under the name it had");

  await db
    .update(schema.guilds)
    .set({ name: "Nightfall Reborn" })
    .where(sqlEq(schema.guilds.guildId, "g1"));

  const after = (await weekRecordsFor(db, WEEK_1)).find((r) => r.guildId === "g1")!;
  eq(after.guildName, "Nightfall", "and it still reads that way after the rename");

  const [live] = await db.select().from(schema.guilds).where(sqlEq(schema.guilds.guildId, "g1"));
  eq(live.name, "Nightfall Reborn", "while the server really did change its name");
});

// ── W6 · an ineligible server gets a row, with the reason ───────────────────

test("an ineligible server that carried entrants has a row, and it says exactly why", async () => {
  // W6 — *"you earned nothing and here is exactly why"* is the question this
  // table exists to answer, and a table holding only winners cannot answer it.
  const db = await resetDemoDb();
  await aWeek(db, WEEK_1, { g2Ready: false });
  await closeWeek(db, WEEK_1);

  const rows = await weekRecordsFor(db, WEEK_1);
  const dropped = rows.find((r) => r.guildId === "g2");
  ok(dropped !== undefined, "the server that earned nothing still has a row");
  no(dropped!.eligible, "marked ineligible");
  eq(dropped!.totalCents, 0, "with no money");
  ok(dropped!.entrants > 0, "and the entrants it did carry, so it is not merely a refusal");
  ok(
    /complete server profile at the gun/.test(dropped!.ineligibleReason ?? ""),
    "and the reason, field by field, from what the gun saw",
  );
  no(dropped!.profileCompleteAtGun, "with the gun's own answer beside it");
  eq(
    dropped!.linkedAtGun,
    LINKED_MEMBERS_TO_UNLOCK_POOL + 2,
    "including the half it *did* satisfy — so it knows what to fix and what not to",
  );
});

// ── W7 · a closed week's gate is never overwritten ──────────────────────────

test("closing week 2 leaves week 1's record untouched", async () => {
  // W7 — the guild row carries only the current week's flag. The next Monday's
  // gun overwrites it, and that is exactly why the per-week answer lives here.
  // This is the ruling that overturned the first design.
  const db = await resetDemoDb();
  await aWeek(db, WEEK_1);
  await closeWeek(db, WEEK_1);
  const week1 = await weekRecordsFor(db, WEEK_1);
  const before = JSON.stringify(week1);
  ok(week1.every((r) => r.eligible === true || r.ineligibleReason !== null), "week 1 is recorded");

  // Week 2's gun fires. It overwrites the guild row's flag — which is the
  // whole point: those columns are the *current* week.
  await aWeek(db, WEEK_2, { fresh: false, g2Ready: false });
  const [guild] = await db.select().from(schema.guilds).where(sqlEq(schema.guilds.guildId, "g2"));
  eq(
    guild.eligibilityFrozenAt?.getTime(),
    WEEK_2.getTime(),
    "the guild row now describes week 2",
  );

  await closeWeek(db, WEEK_2);

  eq(
    JSON.stringify(await weekRecordsFor(db, WEEK_1)),
    before,
    "and week 1's record is byte-for-byte what it was — a closed week's gate is not overwritten",
  );
  ok((await weekRecordsFor(db, WEEK_2)).length > 0, "while week 2 has a record of its own");
});

// ── W2 · a correction is a new row ──────────────────────────────────────────

test("a correction is a new row naming what it supersedes, never an edit", async () => {
  const db = await resetDemoDb();
  await aWeek(db, WEEK_1);
  await closeWeek(db, WEEK_1);

  const original = (await weekRecordsFor(db, WEEK_1)).find((r) => r.guildId === "g1")!;
  const err = await throws(
    () => superseded(db, { recordId: original.id, reason: "  ", patch: {} }),
    /carries a reason/,
    "a correction with no reason is an edit with extra steps",
  );
  ok(err instanceof RecordRefused, "refused by name");

  const newId = await superseded(db, {
    recordId: original.id,
    reason: "entrant double-counted after a support ticket",
    patch: { entrants: original.entrants - 1 },
  });

  const all = await db
    .select()
    .from(schema.weekRecords)
    .where(sqlEq(schema.weekRecords.weekStart, WEEK_1));
  const stillThere = all.find((r) => r.id === original.id)!;
  near(stillThere.entrants, original.entrants, "the original is untouched");

  const current = await weekRecordsFor(db, WEEK_1);
  eq(
    current.filter((r) => r.guildId === "g1").map((r) => r.id),
    [newId],
    "and only the correction is current — both rows exist, one supersedes the other",
  );
  const correction = current.find((r) => r.id === newId)!;
  eq(correction.supersedesId, original.id, "naming what it replaces");
  ok(/double-counted/.test(correction.supersededReason ?? ""), "and why");
});

test("currentRows keeps a row nothing supersedes, and drops one that is superseded", () => {
  // The negative half. Without it, a `currentRows` that returned everything —
  // or nothing — satisfies the test above by accident.
  const rows = [
    { id: "a", supersedesId: null },
    { id: "b", supersedesId: "a" },
    { id: "c", supersedesId: null },
  ];
  eq(currentRows(rows).map((r) => r.id), ["b", "c"], "a is superseded by b; c stands alone");
  eq(
    currentRows([{ id: "only", supersedesId: null }]).map((r) => r.id),
    ["only"],
    "and an uncorrected row is current",
  );
});

// ── Reading it back ─────────────────────────────────────────────────────────

test("a server's history reads newest first, across weeks", async () => {
  const db = await resetDemoDb();
  await aWeek(db, WEEK_1);
  await closeWeek(db, WEEK_1);
  await aWeek(db, WEEK_2, { fresh: false });
  await closeWeek(db, WEEK_2);

  const history = await weekRecordsForGuild(db, "g1");
  eq(history.length, 2, "two weeks");
  eq(
    history[0].weekStart.getTime(),
    WEEK_2.getTime(),
    "newest first — the week somebody is asking about is nearly always the last one",
  );
});

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * A whole week: two servers, a paid challenge, entrants, a gun and a pool.
 *
 * `g2Ready: false` leaves g2's profile incomplete **before** the gun, which is
 * the only way to make it ineligible — E3 means clearing it afterwards changes
 * nothing, and a fixture that tried would be testing the wrong rule.
 */
async function aWeek(
  db: DB,
  weekStart: Date,
  opts: { fresh?: boolean; g2Ready?: boolean } = {},
) {
  if (opts.fresh !== false) {
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
      await linkGamers(db, guildId, LINKED_MEMBERS_TO_UNLOCK_POOL + 2);
    }
  }

  if (opts.g2Ready === false) {
    await db
      .update(schema.guilds)
      .set({ coverImageUrl: null })
      .where(sqlEq(schema.guilds.guildId, "g2"));
  } else if (opts.fresh === false) {
    await db
      .update(schema.guilds)
      .set({ coverImageUrl: "https://cdn.test/g2.png" })
      .where(sqlEq(schema.guilds.guildId, "g2"));
  }
  await freezeEligibilityAtGun(db, weekStart);

  const challengeId = await aLiveChallenge(db, weekStart);
  // g1 is parent on two entrants and the join server on one of g2's — so the
  // ½ + ½ case is in the record and `entrantsWhole` differs from the decimal.
  await entrant(db, challengeId, { parent: "g1", join: "g1" }, weekStart);
  await entrant(db, challengeId, { parent: "g1", join: "g2" }, weekStart);
  await entrant(db, challengeId, { parent: "g2", join: "g2" }, weekStart);

  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "c", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await markPaid(db, invoiceId);
  await allocateToPool(db, { weekStart, amountCents: 4_000 });
}

async function linkGamers(db: DB, guildId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const userId = await createGamer(db, {
      displayName: `${guildId}-m${i}`,
      parentGuildId: guildId,
    });
    await db.insert(schema.linkedGameAccounts).values({
      id: uid(),
      userId,
      provider: "chesscom",
      providerAccountId: `acct-${uid()}`,
      verifiedMethod: "exists",
    });
  }
}

async function entrant(
  db: DB,
  challengeId: string,
  who: { parent: string | null; join: string | null },
  baselineAt: Date,
) {
  const userId = await createGamer(db, { displayName: `entrant-${uid()}` });
  await db.insert(schema.challengeParticipants).values({
    id: uid(),
    challengeId,
    userId,
    linkedAccountId: uid(),
    joinGuildId: who.join,
    parentGuildIdAtBaseline: who.parent,
    baselineAt,
    baseline: { wins: 0, matches: 0 },
  });
}

async function aLiveChallenge(db: DB, startAt: Date): Promise<string> {
  const challengeId = await createChallenge(db, {
    title: "Acme Weekly",
    game: "Chess",
    provider: "chesscom",
    startAt,
    metrics: { wins: 10, matches: 1 },
  });
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "Challenge", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await attachInvoice(db, challengeId, invoiceId);
  await markPaid(db, invoiceId);
  await markScheduled(db, challengeId);
  await announce(db, challengeId, "admin-1", ["g1", "g2"]);
  return challengeId;
}
