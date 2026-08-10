// B86 — the data with a deadline, and the arithmetic that rests on it.
//
// The assertions that matter are the ones that stop a server being paid real
// money for something that did not happen:
//
//   * An entrant is worth ONE entrant across the whole network, however many
//     servers they belong to. The old attribution counted them once per server,
//     which meant an owner could mass-invite other servers' gamers and score
//     for every one of them at zero cost. Σ over servers must never exceed the
//     true count — that is the whole fix, expressed as an inequality.
//   * A vault balance is a sum of rows. If a transfer can ever write one leg
//     without the other, money appears or vanishes.
//   * A split that does not total 100 invents or loses money.
//   * A pool with more slots than servers must not strand the difference.
//
//   DEMO_DB=1 npx tsx tests/db/attribution.mts

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
const near = (name: string, got: number, want: number, tol = 0.001) =>
  ok(name, Math.abs(got - want) < tol, `got ${got}, want ${want}`);

const { exclusiveEntrants, percentile, scoreWeek, weekPayouts, bracketOf, BRACKETS, SCORE_WEIGHTS } =
  await import("../../lib/server-score.ts");
const { DEFAULT_SPLIT, SPLIT_PRESETS, splitProblems, allocate, VAULTS, transfer, balances, postToLedger } =
  await import("../../lib/vaults.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");

console.log("== an entrant is worth ONE entrant, network-wide ==");
// THE assertion. This is the attack the 1/k weighting exists to kill: an owner
// invites gamers who already belong to other servers and, under the old derived
// attribution, scores a full entrant for each of them.
{
  const rows = [
    { userId: "u1", guildId: "a" }, { userId: "u1", guildId: "b" }, { userId: "u1", guildId: "c" },
    { userId: "u2", guildId: "a" },
    { userId: "u3", guildId: "b" }, { userId: "u3", guildId: "c" },
  ];
  const m = exclusiveEntrants(rows);
  near("a gamer in three servers gives each a third", m.get("a")! - 1, 1 / 3);
  near("…and one in two gives each a half", m.get("c")!, 1 / 3 + 1 / 2);
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  const truth = new Set(rows.map((r) => r.userId)).size;
  near("the shares sum to the TRUE entrant count", total, truth);
  ok("…and can never exceed it", total <= truth + 1e-9, `${total} vs ${truth}`);
}
{
  // The pre-B86 rows. They cannot be attributed and must not be guessed.
  const m = exclusiveEntrants([{ userId: "u1", guildId: "" }, { userId: "u2", guildId: "a" }]);
  eq("an unattributed row scores for nobody", m.get("")??0, 0);
  near("…and does not inflate anyone else", m.get("a")!, 1);
}

console.log("\n== scoring cannot be bought ==");
{
  // Raw member count appears nowhere in the weights. That is the point: it is
  // the one input that costs about five dollars to fake.
  eq("the four weights total 100", Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  ok("growth-by-member-count is not a term", !("growth" in SCORE_WEIGHTS) && !("memberCount" in SCORE_WEIGHTS));
}
{
  const tier = [
    { guildId: "small", exclusiveEntrants: 5, newlyQualified: 3, linked: 10, entrants: 5, recentWins: 0 },
    { guildId: "big", exclusiveEntrants: 50, newlyQualified: 3, linked: 500, entrants: 50, recentWins: 0 },
  ];
  const small = scoreWeek(tier[0], tier);
  const big = scoreWeek(tier[1], tier);
  // Both convert at 10%, so conversion ties; the big server wins volume terms.
  ok("the bigger server still scores higher on volume", big > small, `${big} vs ${small}`);
  // …but a percentile bound means it cannot take everything.
  ok("…and the smaller one is not zeroed", small > 0, String(small));
}
{
  // Per-capita is what lets a small server beat a big one.
  const tier = [
    { guildId: "sharp", exclusiveEntrants: 8, newlyQualified: 9, linked: 10, entrants: 8, recentWins: 0 },
    { guildId: "lazy", exclusiveEntrants: 10, newlyQualified: 1, linked: 500, entrants: 10, recentWins: 0 },
  ];
  ok("a small, engaged server beats a big, idle one",
    scoreWeek(tier[0], tier) > scoreWeek(tier[1], tier));
}

console.log("\n== decay, not a cooldown ==");
// DECAY IS RETIRED. It multiplied a repeat winner's score down to a floor of
// 0.5 over eight weeks — punishing a server for being the best one on the
// network, which is the opposite of what a network wants. Score-proportional
// shares already give everyone below the leader a real slice, so the thing
// decay existed to soften no longer happens.
//
// Asserted as ABSENT rather than deleted, so it cannot quietly come back.
{
  const score = await import("../../lib/server-score.ts");
  ok("decay is gone from the scoring module", !("decayFor" in score), Object.keys(score).join(","));
  ok("…and so is the slot ladder", !("slotsFor" in score));
}

console.log("\n== brackets: big servers cannot eat the small pool ==");
{
  eq("the three brackets total 100%", BRACKETS.reduce((a, b) => a + b.share, 0), 100);
  eq("a 0-member server is small", bracketOf(0), "small");
  eq("499 is still small", bracketOf(499), "small");
  eq("500 is mid", bracketOf(500), "mid");
  eq("1,000 is large", bracketOf(1000), "large");

  // THE QUESTION THIS ANSWERS: four large servers turn up. Can they take
  // everything? Under fixed per-server percentages they could — 4 × 25% is the
  // whole pool. Under brackets they take the large bracket's share and no more.
  const ranked = [
    { guildId: "s1", score: 80, bracket: "small" as const },
    { guildId: "s2", score: 40, bracket: "small" as const },
    { guildId: "L1", score: 90, bracket: "large" as const },
    { guildId: "L2", score: 90, bracket: "large" as const },
  ];
  const { payouts } = weekPayouts(10_000, ranked);
  const by = Object.fromEntries(payouts.map((p) => [p.guildId, p.amount]));
  const smallTotal = (by.s1 ?? 0) + (by.s2 ?? 0);
  const largeTotal = (by.L1 ?? 0) + (by.L2 ?? 0);

  ok("every share adds back to the pool",
    Math.abs(smallTotal + largeTotal - 10_000) < 0.05, `${smallTotal + largeTotal}`);
  // 60 : 15 with the mid bracket empty → 80% / 20%.
  ok("the small bracket keeps the larger share even against higher scores",
    smallTotal > largeTotal * 3, `small ${smallTotal.toFixed(2)} vs large ${largeTotal.toFixed(2)}`);
  ok("…and two identical large servers split their bracket evenly",
    Math.abs((by.L1 ?? 0) - (by.L2 ?? 0)) < 0.05);
  // Within the small bracket: 80 vs 40 is 2:1 on the competitive half, plus a
  // flat share each. The higher scorer must be ahead — that is the whole
  // incentive to climb, which an equal split would have removed.
  ok("a higher score is paid more inside a bracket", (by.s1 ?? 0) > (by.s2 ?? 0),
    `${by.s1} vs ${by.s2}`);
}

console.log("\n== an empty bracket gives its share away ==");
{
  // Money set aside for servers that did not turn up is money nobody can be
  // paid, and holding it back would shrink a pool that was already announced.
  const only = [{ guildId: "a", score: 10, bracket: "small" as const }];
  const { payouts } = weekPayouts(1000, only);
  const total = payouts.reduce((a, p) => a + p.amount, 0);
  ok("one small server alone takes the whole pool", Math.abs(total - 1000) < 0.05, String(total));
}

console.log("\n== everyone who took part is paid something ==");
{
  // No cliff at #21. The old slot ladder paid the top 20% and nothing to the
  // rest, so 20th place got a cheque and 21st got nothing over one entrant.
  const many = Array.from({ length: 30 }, (_, i) => ({
    guildId: `g${i}`, score: 30 - i, bracket: "small" as const,
  }));
  const { payouts } = weekPayouts(10_000, many);
  eq("all thirty are paid", payouts.length, 30);
  ok("…and the last one is not zero",
    (payouts.find((p) => p.guildId === "g29")?.amount ?? 0) > 0);
}

console.log("\n== a distribution has no floor, and loses nothing. M2 ==");
{
  // WHAT THIS REPLACED, AND WHY IT WAS THE WRONG TEST.
  //
  // It used to assert `carried` held the money — "the money is carried, not
  // lost" — and passed. But `carried` was a number printed into a summary
  // string. It was never credited to a server, never rolled into the next
  // week's pool, never paid. The test checked that a variable held a figure,
  // not that anybody received it, so forty small servers could earn $200
  // between them and receive nothing while this stayed green.
  //
  // The property worth testing is CONSERVATION: what goes into the week comes
  // out in wallets. A distribution is a number moving between two rows in our
  // own database, so there is no fee to justify a minimum and nothing may be
  // withheld.
  const many = Array.from({ length: 40 }, (_, i) => ({
    guildId: `t${i}`, score: 1, bracket: "small" as const,
  }));
  const { payouts } = weekPayouts(200, many);

  eq("forty tiny servers are all paid", payouts.length, 40);
  const total = payouts.reduce((a, p) => a + p.amount, 0);
  ok("…and the whole pool reaches them", Math.abs(total - 200) < 0.5, String(total));
  ok("…even though each share is only a few dollars",
    payouts.every((p) => p.amount > 0 && p.amount < 25),
    JSON.stringify(payouts.slice(0, 3)));

  // The extreme case the old floor swallowed whole: a pool small enough that
  // every share is under a dollar. It still lands.
  const tiny = weekPayouts(4, many).payouts;
  eq("a $4 pool across forty servers still pays all forty", tiny.length, 40);
  ok("…and still adds up", Math.abs(tiny.reduce((a, p) => a + p.amount, 0) - 4) < 0.5);

  // A floor is not an option any more. Passing one must not resurrect it.
  ok("weekPayouts takes no floor option",
    !/floor/.test(readFileSync(new URL("../../lib/server-score.ts", import.meta.url), "utf8")
      .split("export function weekPayouts")[1].split("\n}")[0]),
    "a floor on a distribution is money nobody can be paid");
}

console.log("\n== a week's pool leaves nothing stranded ==");
{
  // THREE STALE BLOCKS WERE HERE, AND THEY HAD STOPPED TESTING ANYTHING. M2.
  //
  // They called `weekPayouts(pool, ranked, slots, { floor })` — a FOUR-argument
  // signature from the retired slot ladder. The function has taken three
  // arguments for a long time, so `slots` was being read as the options object
  // and `{ floor }` was dropped on the floor entirely. Every assertion about a
  // floor in them was checking a parameter the function never received, and
  // `carried` was `undefined`, which `> 0` quietly answers `false` for.
  //
  // They were green because nothing they asserted could fail.
  //
  // What they were reaching for is worth keeping: a pool must be conserved, and
  // an empty week must pay nobody. Both, against the real signature.
  const ranked = Array.from({ length: 10 }, (_, i) => ({ guildId: `g${i}`, score: 100 - i }));
  const { payouts } = weekPayouts(1000, ranked);
  const total = payouts.reduce((a, p) => a + p.amount, 0);
  near("every dollar of the pool has a destination", total, 1000, 0.02);
  ok("…and every server got some of it", payouts.length === 10, String(payouts.length));
}
{
  // An awkward number, to catch a rounding rule that loses cents. Rounding is
  // absorbed by the largest share, never dropped.
  const ranked = Array.from({ length: 10 }, (_, i) => ({ guildId: `g${i}`, score: 100 - i }));
  const { payouts } = weekPayouts(157.5, ranked);
  near("an odd pool is still conserved", payouts.reduce((a, p) => a + p.amount, 0), 157.5, 0.02);
  ok("…with nobody dropped for being small", payouts.length === 10, String(payouts.length));
}
{
  const { payouts } = weekPayouts(1000, []);
  eq("a week with no participants pays nobody", payouts.length, 0);
}

console.log("\n== the split is a money invariant ==");
eq("the default totals 100", VAULTS.reduce((a, v) => a + DEFAULT_SPLIT[v], 0), 100);
for (const [name, p] of Object.entries(SPLIT_PRESETS)) {
  eq(`preset "${name}" totals 100`, VAULTS.reduce((a, v) => a + p[v], 0), 100);
  eq(`…and keeps prizes at half`, p.prize, 50);
}
eq("a valid split has nothing to say", splitProblems(DEFAULT_SPLIT), []);
ok("99 is refused", splitProblems({ prize: 50, cluster: 19, server: 15, cp: 15 }).some((m) => /not 100/.test(m)));
ok("101 is refused", splitProblems({ prize: 50, cluster: 21, server: 15, cp: 15 }).some((m) => /not 100/.test(m)));
ok("a negative share is refused", splitProblems({ prize: 50, cluster: 70, server: -5, cp: -15 }).some((m) => /negative/.test(m)));
{
  const a = allocate(350);
  eq("$350 splits as decided", [a.prize, a.cluster, a.server, a.cp], [175, 70, 52.5, 52.5]);
  const b = allocate(700);
  eq("…and doubling the price doubles every pool", [b.prize, b.cluster, b.server, b.cp], [350, 140, 105, 105]);
  near("the parts sum to the whole", VAULTS.reduce((s, v) => s + b[v], 0), 700);
}

console.log("\n== a vault balance is a sum of rows ==");
{
  const db = await getDb();
  const before = await balances(db);
  await postToLedger(db, [{ vault: "cluster", amount: 100, kind: "challenge_sale", refId: "c1", refType: "challenge" }]);
  const after = await balances(db);
  near("an inflow moves exactly one vault", after.cluster - before.cluster, 100);
  near("…and no other", after.cp - before.cp, 0);

  const t = await transfer(db, { from: "cluster", to: "cp", amount: 40, reason: "fund the mission", actorId: "admin1" });
  ok("a transfer succeeds", t.ok === true);
  const end = await balances(db);
  near("…and moves both legs", end.cluster - after.cluster, -40);
  near("…the other way too", end.cp - after.cp, 40);
  near("…conserving the total", (end.cluster + end.cp) - (after.cluster + after.cp), 0);

  const rows = await db.select({ transferId: schema.vaultLedger.transferId }).from(schema.vaultLedger);
  const legs = rows.filter((r) => r.transferId === (t as { transferId: string }).transferId);
  eq("a transfer is two rows sharing an id", legs.length, 2);

  const bad = await transfer(db, { from: "cp", to: "cp", amount: 5, reason: "x", actorId: "a" });
  ok("a transfer to itself is refused", bad.ok === false);
  const noReason = await transfer(db, { from: "cp", to: "cluster", amount: 5, reason: "  ", actorId: "a" });
  ok("…and one with no reason is refused", noReason.ok === false);
  const negative = await transfer(db, { from: "cp", to: "cluster", amount: -5, reason: "x", actorId: "a" });
  ok("…and a negative amount is refused", negative.ok === false);
}

console.log("\n== the snapshot is idempotent, and the week is Monday-based ==");
{
  const { weekStartOf, captureGuildSnapshots } = await import("../../lib/guild-snapshot.ts");
  // Sunday belongs to the week that started the Monday BEFORE it, not the one
  // starting tomorrow. Getting this backwards silently shifts every score by a
  // day and nobody would see it until an owner argued about a payout.
  eq("Monday is its own week start", weekStartOf(new Date("2026-03-09T12:00:00Z")).toISOString().slice(0, 10), "2026-03-09");
  eq("…Wednesday belongs to it", weekStartOf(new Date("2026-03-11T23:59:00Z")).toISOString().slice(0, 10), "2026-03-09");
  eq("…and so does Sunday", weekStartOf(new Date("2026-03-15T23:59:00Z")).toISOString().slice(0, 10), "2026-03-09");
  eq("…the next Monday starts a new one", weekStartOf(new Date("2026-03-16T00:00:00Z")).toISOString().slice(0, 10), "2026-03-16");

  const db2 = await getDb();
  const at = new Date("2026-03-11T09:00:00Z");
  const first = await captureGuildSnapshots(at);
  const again = await captureGuildSnapshots(new Date("2026-03-13T09:00:00Z"));
  eq("running it twice in one week is the same week", first.week, again.week);
  const rows = await db2.select({ id: schema.guildSnapshots.id }).from(schema.guildSnapshots);
  eq("…and writes one row per guild, not two", rows.length, first.guilds);
  ok("a snapshot exists for every guild the bot is in", first.written === first.guilds,
    `${first.written} of ${first.guilds}`);
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
