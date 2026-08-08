// B74 / Gate 2 — the money invariants, under parallel writes.
//
// This file replaces `tests/db/marketplace.mts:148`, which the due-diligence
// report correctly called vacuous: it asserted a balance was not negative, and
// the balance is computed as a sum of non-negative terms, so it could not have
// been. A test that cannot fail is worse than no test, because it occupies the
// space where a real one would go.
//
// WHAT THIS FILE CAN AND CANNOT PROVE — stated up front, because overclaiming
// here is how the last report started:
//
//   * It CAN prove the logic is correct under interleaving: that the ceiling
//     holds, that a balance is spent once, and that one trophy yields one
//     redemption, when many callers run at once against a real Postgres with
//     real transactions and a real row lock.
//   * It CANNOT prove production is safe on its own, because the demo database
//     is PGlite — one in-process instance. The property that makes production
//     safe is that the money paths run on the POOLED driver, since
//     `neon-http` cannot open a transaction at all. So that is asserted
//     separately, from the source, at the bottom of this file. Together they
//     are the claim; either alone is not.
//
// RUN IT AGAINST A REAL POSTGRES, and CI does:
//
//   DEMO_DB=1 npx tsx tests/db/concurrency.mts                    # logic only
//   DATABASE_URL=postgresql://… npx tsx tests/db/concurrency.mts  # the real lock
//
// The second form matters and it exists because of a due-diligence finding:
// PGlite serialises everything for free on one connection, so this suite was
// green **without ever having exercised the failure mode it defends against**.
// A non-Neon `DATABASE_URL` now routes both `getDb` and `withTx` through
// node-postgres, which pools genuine separate connections.
//
// THE NEGATIVE CONTROL, measured rather than assumed. With `FOR UPDATE` removed
// from `lockGamer` and the suite run against a real Postgres, these fail:
//
//     FAIL 100 parallel awards stay within the per-action cap — earned 31
//     FAIL four simultaneous claims on one trophy produce one — got 3, want 1
//     FAIL …and one payout row exists — got 3, want 1
//
// Three simultaneous claims on one trophy all succeeding is one trophy paid out
// three times, in dollars. That is what the lock is for, and that is the proof
// this file can fail.
//
// **Honest limit:** the five-way `buyTrophy` race did NOT fail in that control
// run. It is not yet demonstrated that the purchase assertion exercises real
// contention rather than passing by timing, so do not count it as proven.
//
//   DEMO_DB=1 npx tsx tests/db/concurrency.mts

process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const code = (p: string) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

const { getDb, schema } = await import("../../lib/db/index.ts");
const { awardQuestAction, cpEarnedToday, dailyCpCeiling, getTotalCp, ACTION_CATALOG } =
  await import("../../lib/quests.ts");
const { buyTrophy, cpPerDollar, cpSpent, priceOf } = await import("../../lib/marketplace.ts");
const { uid } = await import("../../lib/utils.ts");
const { eq: sqlEq, inArray } = await import("drizzle-orm");

const db = await getDb();

const newGamer = async (name: string) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, email: `${id}@conc.test`, displayName: name, slug: `conc-${id.slice(0, 8)}`,
    passwordHash: "x", ageBand: "adult", role: "user", status: "active",
  });
  return id;
};

console.log("== the daily ceiling holds under parallel awards ==");
// THE test. The 500 ceiling is the entire cost model: it is the reason a gamer
// costs $0.05 a day rather than an unbounded amount. Before B74 this was a
// read-then-write race, so N simultaneous awards each read "0 earned today",
// each found the full ceiling of room, and each paid.
{
  const gamer = await newGamer("Ceiling Racer");
  const ceiling = await dailyCpCeiling(db);
  // `ad_impression` pays 1 and caps at 25 — the highest-frequency action we
  // have, and therefore the one most likely to arrive in a burst for real.
  const imp = ACTION_CATALOG.find((a) => a.key === "ad_impression")!;
  // Enough parallel awards to blow through the cap several times over if
  // nothing is serialising them.
  const N = imp.defaultCap * 4;
  await Promise.all(
    Array.from({ length: N }, (_, i) =>
      awardQuestAction(db, gamer, "ad_impression", { refType: "imp", refId: `race-${i}` })),
  );
  const earned = await cpEarnedToday(db, gamer);
  ok(`${N} parallel awards stay within the per-action cap`,
    earned <= imp.defaultWeight * imp.defaultCap, `earned ${earned}`);
  ok("…and within the daily ceiling", earned <= ceiling, `earned ${earned} of ${ceiling}`);
  // The positive half: serialising must not mean losing writes.
  ok("…and something was actually awarded", earned > 0, `earned ${earned}`);
}

console.log("\n== the SAME action, same ref, in parallel, pays once ==");
// Dedup was a select-then-insert too: both readers miss the row, both insert.
{
  const gamer = await newGamer("Dupe Racer");
  await Promise.all(Array.from({ length: 8 }, () =>
    awardQuestAction(db, gamer, "join_planet", { refType: "pl", refId: "the-same-planet" })));
  const planet = ACTION_CATALOG.find((a) => a.key === "join_planet")!;
  eq("eight identical awards pay for one", await cpEarnedToday(db, gamer), planet.defaultWeight);
  const rows = await db.select({ id: schema.questEvents.id }).from(schema.questEvents)
    .where(sqlEq(schema.questEvents.userId, gamer));
  eq("…and wrote one ledger row", rows.length, 1);
}

console.log("\n== a balance is spent ONCE, however many buyers race for it ==");
// Two purchases submitted together both re-read the same balance, both found it
// sufficient, and both inserted. One balance, two trophies.
{
  const gamer = await newGamer("Double Spender");
  const rate = await cpPerDollar(db);
  const trophyId = uid();
  await db.insert(schema.trophies).values({
    id: trophyId, name: "Concurrency Cup", imageUrl: "/x.png", value: "0", inMarketplace: true,
  });
  const price = priceOf({ value: "0" } as never, rate);

  // Fund the account with exactly enough for ONE, written straight to the
  // ledger so the funding itself is not what is under test.
  const [quest] = await db.select().from(schema.quests).limit(1);
  await db.insert(schema.questEvents).values({
    id: uid(), userId: gamer, questId: quest.id, actionKey: "manual",
    qpAwarded: 0, cpAwarded: price, refType: "seed", refId: "funding",
  });
  eq("the gamer can afford exactly one", await getTotalCp(db, gamer), price);

  const results = await Promise.all(Array.from({ length: 5 }, () => buyTrophy(gamer, trophyId)));
  const bought = results.filter((r) => r.ok);
  eq("five simultaneous purchases leave exactly one buyer", bought.length, 1);
  ok("…and the others are refused with a reason, not an exception",
    results.filter((r) => !r.ok).every((r) => typeof r.error === "string" && r.error.length > 0));

  const spent = await db.select({ id: schema.marketplaceOrders.id })
    .from(schema.marketplaceOrders).where(sqlEq(schema.marketplaceOrders.buyerId, gamer));
  eq("…and one order was written", spent.length, 1);
  // Assert on the UNCLAMPED difference, and this is the point the old test
  // missed. `cpWallet` returns `Math.max(0, earned - spent)`
  // (`lib/marketplace.ts:141`), so "the balance is not negative" is true of the
  // clamp rather than of the ledger — which is precisely why the assertion at
  // `tests/db/marketplace.mts:148` could not fail. Overspending shows up as
  // spent EXCEEDING earned, and it is invisible through the wallet.
  const earned = await getTotalCp(db, gamer);
  const spentCp = await cpSpent(db, gamer);
  eq("exactly one purchase was debited", spentCp, price);
  eq("…and the ledger nets to zero, unclamped", earned - spentCp, 0);
  ok("…so no CP was spent that was never earned", spentCp <= earned, `spent ${spentCp} of ${earned}`);
}

console.log("\n== one trophy yields one redemption ==");
// The dollar-denominated race. Two submissions of the same award both saw
// status "held" and both created a pending payout for it.
{
  const gamer = await newGamer("Redeem Racer");
  const trophyId = uid();
  await db.insert(schema.trophies).values({ id: trophyId, name: "Cash Cup", imageUrl: "/x.png", value: "5" });
  const awardId = uid();
  await db.insert(schema.userTrophies).values({
    id: awardId, userId: gamer, trophyId, challengeId: null, placement: 1, status: "held",
  });

  // `requestRedeem` is a server action behind a session, so the invariant is
  // exercised through the same transaction shape it uses: claim the award only
  // while it is still held.
  const { lockGamer, withTx } = await import("../../lib/db/tx.ts");
  const claim = async () => withTx(db, async (tx) => {
    await lockGamer(tx, gamer);
    const held = await tx.select({ id: schema.userTrophies.id }).from(schema.userTrophies)
      .where(inArray(schema.userTrophies.id, [awardId]));
    if (!held.length || held.length !== 1) return false;
    const [row] = await tx.select({ status: schema.userTrophies.status })
      .from(schema.userTrophies).where(sqlEq(schema.userTrophies.id, awardId));
    if (row.status !== "held") return false;
    const rid = uid();
    await tx.insert(schema.trophyRedeems).values({
      id: rid, userId: gamer, awardIds: [awardId], amount: 5,
      currency: "USD", method: "paypal", status: "pending",
    });
    await tx.update(schema.userTrophies).set({ status: "pending" })
      .where(sqlEq(schema.userTrophies.id, awardId));
    return true;
  });

  const outcomes = await Promise.all([claim(), claim(), claim(), claim()]);
  eq("four simultaneous claims on one trophy produce one", outcomes.filter(Boolean).length, 1);
  const redeems = await db.select({ id: schema.trophyRedeems.id })
    .from(schema.trophyRedeems).where(sqlEq(schema.trophyRedeems.userId, gamer));
  eq("…and one payout row exists", redeems.length, 1);
}

console.log("\n== the production driver can actually hold a transaction ==");
// What PGlite cannot demonstrate. `neon-http` executes every statement as its
// own request and CANNOT open an interactive transaction, so a money path that
// reaches for one on that driver has no protection at all — the code would look
// correct and be a race. These assertions are about the SOURCE for that reason.
{
  const tx = code("lib/db/tx.ts");
  ok("the transactional layer uses the POOLED driver", /neon-serverless/.test(tx));
  ok("…and a Pool, not a single http client", /new Pool\(/.test(tx));
  ok("…and takes a row lock", /for update/i.test(tx));
  ok("the http driver is still what plain reads use", /neon-http/.test(code("lib/db/index.ts")));

  for (const [file, fn] of [
    ["lib/quests.ts", "the CP ceiling"],
    ["lib/marketplace.ts", "buying a trophy"],
    ["app/actions/trophies.ts", "redeeming for cash"],
  ] as const) {
    const c = code(file);
    ok(`${fn} runs inside withTx`, /withTx\(/.test(c), file);
    ok(`…behind a lock on the gamer`, /lockGamer\(/.test(c), file);
  }

  // The finding was not only "no transactions" but "bare catch on a money
  // path", which made a failed write indistinguishable from a successful one.
  ok("no bare `catch {}` remains around the award path",
    !/catch\s*\{\s*\}/.test(code("lib/quests.ts")));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
