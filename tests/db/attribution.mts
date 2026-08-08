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

const { exclusiveEntrants, percentile, scoreWeek, decayFor, weekPayouts, SCORE_WEIGHTS } =
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
eq("a first-time winner is undecayed", decayFor(0), 1);
ok("a repeat winner declines", decayFor(4) < decayFor(1));
ok("…but is never locked out", decayFor(99) >= 0.5, String(decayFor(99)));

console.log("\n== a week's pool leaves nothing stranded ==");
{
  // Ten servers, twenty slots — the "Launch" preset against a small network.
  // Half the pool would have had no destination and no rule.
  const ranked = Array.from({ length: 10 }, (_, i) => ({ guildId: `g${i}`, score: 100 - i }));
  const slots = Array.from({ length: 20 }, () => ({ share: 5 }));
  const { payouts, carried } = weekPayouts(1000, ranked, slots, { floor: 0 });
  const total = payouts.reduce((a, p) => a + p.amount, 0);
  near("every dollar of the pool has a destination", total + carried, 1000, 0.02);
}
{
  // The floor. A $7.88 transfer costs more in fees than it delivers.
  const ranked = Array.from({ length: 10 }, (_, i) => ({ guildId: `g${i}`, score: 100 - i }));
  const { payouts, carried } = weekPayouts(157.5, ranked, [{ share: 100 }], { floor: 25 });
  ok("nothing is paid below the floor", payouts.every((p) => p.amount >= 25), JSON.stringify(payouts));
  ok("…and what is held is carried, not lost", carried > 0, String(carried));
  near("pool is conserved", payouts.reduce((a, p) => a + p.amount, 0) + carried, 157.5, 0.02);
}
{
  const { payouts, carried } = weekPayouts(1000, [], [{ share: 100 }], { floor: 0 });
  eq("a week with no participants pays nobody", payouts.length, 0);
  eq("…and strands nothing", carried, 0);
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
