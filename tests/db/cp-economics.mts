// B34 — what a gamer costs us, per day, in the worst case.
//
// This is the file that decides whether the business survives its own success,
// so it is written WITH the item (§1.1's money exception). Every number here is
// a fixture on purpose: a weight should only ever move because somebody meant to
// move it, with a diff that says so.
//
//   DEMO_DB=1 npx tsx tests/db/cp-economics.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { ACTION_CATALOG, ACTION_CAP_SUM, DEFAULT_DAILY_CP_CEILING, awardQuestAction,
  getTotalCp, getCpLedger, cpEarnedToday, dailyCpCeiling } = await import("../../lib/quests.ts");
const { priceOf, DEFAULT_CP_PER_DOLLAR } = await import("../../lib/marketplace.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { and, eq: sqlEq, sql } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

console.log("== the table ==");
const uncapped = ACTION_CATALOG.filter((a) => !(a.defaultCap > 0)).map((a) => a.key);
eq("no action lacks a cap", uncapped, []);
// RETIRED actions are exempt (B61): posts, comments and reactions pay nothing
// on purpose — there are no posts on planets any more. They are kept in the
// table at weight 0 rather than deleted, so a quest whose stored weights still
// name one reads it as zero instead of throwing. Everything that is still live
// must pay something, because an action worth 0 that is meant to pay is a quest
// nobody can progress and nothing about it looks wrong.
const RETIRED = ACTION_CATALOG.filter((a) => a.label.includes("(retired)")).map((a) => a.key);
eq("the retired actions are the ones we retired", RETIRED,
  ["write_post", "write_comment", "reaction_given", "reaction_received"]);
ok("no LIVE action pays nothing",
  ACTION_CATALOG.filter((a) => !RETIRED.includes(a.key)).every((a) => a.defaultWeight > 0));
ok("…and every retired one pays exactly nothing",
  ACTION_CATALOG.filter((a) => RETIRED.includes(a.key)).every((a) => a.defaultWeight === 0));
// The fixture. If this fails, somebody moved a weight — read the diff and decide
// whether they meant to, then change this number in the same commit.
eq("the per-action caps sum to exactly 1330", ACTION_CAP_SUM, 1330);
eq("the ceiling is 500", DEFAULT_DAILY_CP_CEILING, 500);
ok("the ceiling is below the cap sum — the guarantee does not depend on the table",
  DEFAULT_DAILY_CP_CEILING < ACTION_CAP_SUM);
eq("every action key is unique", new Set(ACTION_CATALOG.map((a) => a.key)).size, ACTION_CATALOG.length);
// Giving and receiving must price identically, or two accounts can farm the gap.
const gs = ACTION_CATALOG.find((a) => a.key === "gift_sent")!;
const gr = ACTION_CATALOG.find((a) => a.key === "gift_received")!;
eq("a gift pays the same to send as to receive",
  [gs.defaultWeight, gs.defaultCap], [gr.defaultWeight, gr.defaultCap]);

console.log("\n== what it costs ==");
eq("the rate is 10,000 CP to the dollar", DEFAULT_CP_PER_DOLLAR, 10000);
const worstCaseDay = DEFAULT_DAILY_CP_CEILING / DEFAULT_CP_PER_DOLLAR;
eq("a maximal gamer costs $0.05 a day", worstCaseDay, 0.05);
ok("…and $5 over a hundred consecutive days", Math.round(worstCaseDay * 100 * 100) / 100 === 5);
eq("a $5 bronze trophy is 50,000 CP", priceOf({ value: 5, tier: "bronze" }, DEFAULT_CP_PER_DOLLAR), 50000);

// The check in the other direction: a currency that costs nothing is worth
// nothing. CP paid for attention must stay well under what that attention earns.
const imp = ACTION_CATALOG.find((a) => a.key === "ad_impression")!;
const cpmPaid = (imp.defaultWeight / DEFAULT_CP_PER_DOLLAR) * 1000;   // $ per 1,000 impressions
const FLOOR_CPM = 0.50;
ok(`CP paid per 1,000 impressions ($${cpmPaid.toFixed(2)}) is under a floor CPM of $${FLOOR_CPM.toFixed(2)}`,
  cpmPaid < FLOOR_CPM, `cpmPaid=${cpmPaid}`);
ok("…by at least 5×", FLOOR_CPM / cpmPaid >= 5, `ratio=${(FLOOR_CPM / cpmPaid).toFixed(1)}×`);

// ---- Against a real database ----
const db = await getDb();
eq("the ceiling reads back from settings", await dailyCpCeiling(db), 500);

/** A fresh gamer nobody else's events can contaminate. */
async function newGamer(tag: string): Promise<string> {
  const id = uid();
  await db.insert(schema.users).values({
    id, slug: `t-${tag}-${id.slice(0, 6)}`, displayName: `Test ${tag}`,
    email: `${id}@test.invalid`, passwordHash: "x",
  } as never);
  return id;
}
const cpToday = (u: string) => cpEarnedToday(db, u);

console.log("\n== CP once, progress everywhere ==");
// Point a SECOND quest at an action the first already listens to — the exact
// misconfiguration that used to double both the payout and the ceiling.
const [orbit] = await db.select().from(schema.quests).where(sqlEq(schema.quests.key, "orbit")).limit(1);
const [signal] = await db.select().from(schema.quests).where(sqlEq(schema.quests.key, "signal")).limit(1);
const signalWeights = { ...(signal.actionWeights as Record<string, number>) };
const signalCaps = { ...(signal.dailyCaps as Record<string, number>) };
await db.update(schema.quests)
  // `message_new`, not the retired `write_post` — an action at weight 0 is
  // not listened to by any quest, so it cannot demonstrate two that are.
  .set({ actionWeights: { ...signalWeights, message_new: 3 }, dailyCaps: { ...signalCaps, message_new: 3 } })
  .where(sqlEq(schema.quests.id, signal.id));

const twin = await newGamer("twin");
await awardQuestAction(db, twin, "message_new", { refType: "message", refId: "m1" });
// Paid at the WINNING quest's weight — orbit prices `message_new` at 10 and
// sorts first, so 10 is paid once rather than 10 + 3.
eq("an action two quests listen to pays ONCE", await cpToday(twin), 10);
const progressRows = await db.select({ questId: schema.userQuestProgress.questId, qp: schema.userQuestProgress.qp })
  .from(schema.userQuestProgress).where(sqlEq(schema.userQuestProgress.userId, twin));
eq("…and progresses BOTH quests", progressRows.length, 2);
// Each quest progresses by ITS OWN weight — that is the point: progress is
// per quest, payment is once.
ok("…and each progresses by its own weight",
  progressRows.map((r) => r.qp).sort((a, b) => a - b).join(",") === "3,10", JSON.stringify(progressRows));
eq("getTotalCp agrees with the ledger, not with the progress rows", await getTotalCp(db, twin), 10);
const ledger = await getCpLedger(db, twin);
eq("the money log shows one line, not two", ledger.length, 1);
eq("…and it reads the CP that was paid", ledger[0]?.qp, 10);

// Put signal back, so the rest of the run sees the shipped table.
await db.update(schema.quests).set({ actionWeights: signalWeights, dailyCaps: signalCaps })
  .where(sqlEq(schema.quests.id, signal.id));

console.log("\n== the ceiling holds ==");
const grinder = await newGamer("grinder");
// Credit right up to the ceiling with distinct refs so nothing dedupes, then
// keep going. The per-quest cap is raised out of the way on purpose: the point
// is that the CEILING holds even when the per-action caps do not.
const [wide] = await db.select().from(schema.quests).where(sqlEq(schema.quests.key, "orbit")).limit(1);
const wideWeights = { ...(wide.actionWeights as Record<string, number>) };
const wideCaps = { ...(wide.dailyCaps as Record<string, number>) };
await db.update(schema.quests)
  .set({ actionWeights: { ...wideWeights, write_comment: 7 }, dailyCaps: { ...wideCaps, write_comment: 9999 } })
  .where(sqlEq(schema.quests.id, wide.id));

for (let i = 0; i < 100; i++) {
  await awardQuestAction(db, grinder, "write_comment", { refType: "c", refId: `c${i}` });
}
eq("a gamer who grinds all day is credited exactly the ceiling", await cpToday(grinder), 500);
await awardQuestAction(db, grinder, "write_comment", { refType: "c", refId: "one-more" });
eq("…and not one CP more, whatever they do next", await cpToday(grinder), 500);
eq("getTotalCp says the same", await getTotalCp(db, grinder), 500);
// 500 is not divisible by 7, so the last paying award had to be clamped to the
// remainder rather than refused — otherwise the ceiling is really 497.
const [{ n }] = await db.select({ n: sql<number>`COUNT(*)` }).from(schema.questEvents)
  .where(and(sqlEq(schema.questEvents.userId, grinder), sqlEq(schema.questEvents.cpAwarded, 0)));
ok("the awards past the ceiling were recorded as progress paying zero", Number(n) > 0, `n=${n}`);
const paidRows = await db.select({ cp: schema.questEvents.cpAwarded }).from(schema.questEvents)
  .where(sqlEq(schema.questEvents.userId, grinder));
eq("the paid rows sum to the ceiling exactly",
  paidRows.reduce((s, r) => s + (r.cp ?? 0), 0), 500);
ok("the last paying award was clamped to the remainder, not refused",
  paidRows.some((r) => (r.cp ?? 0) > 0 && (r.cp ?? 0) < 7));

await db.update(schema.quests).set({ actionWeights: wideWeights, dailyCaps: wideCaps })
  .where(sqlEq(schema.quests.id, wide.id));

console.log("\n== the per-action cap still shapes behaviour ==");
const capped = await newGamer("capped");
// join_planet pays 10 and caps at 1: doing it five times pays once.
for (let i = 0; i < 5; i++) {
  await awardQuestAction(db, capped, "join_planet", { refType: "planet", refId: `pl${i}` });
}
eq("an action capped at 1 pays once however often it happens", await cpToday(capped), 25);

console.log("\n== legacy rows are not devalued ==");
// A row written before B34 has cp_awarded NULL and must still count for what it
// awarded. Silently zeroing somebody's history is the kind of thing people
// screenshot.
const veteran = await newGamer("veteran");
await db.insert(schema.questEvents).values({
  id: uid(), userId: veteran, questId: orbit.id, actionKey: "write_post",
  qpAwarded: 250, cpAwarded: null, refType: "legacy", refId: "old",
} as never);
eq("a pre-B34 row still counts for what it awarded", await getTotalCp(db, veteran), 250);
eq("…and appears in the money log", (await getCpLedger(db, veteran)).length, 1);

// ---- The model (B16) ----
//
// Pure arithmetic, so these are hand-computable. Every one of them is a number
// somebody will quote in a meeting.
console.log("\n== the model ==");
const { defaultConfig, maxDailyCp, maxDailyCost, expectedDailyCost, exposure,
  abuseSurface, minutesPerDollar, fastestActionMinutesPerDollar, actionMaxDaily, DEFAULT_ASSUMPTIONS } =
  await import("../../lib/cp-economics.ts");

const cfg = defaultConfig();
eq("the model ships with the shipped table", cfg.actions.length, ACTION_CATALOG.length);
eq("…and the shipped rate", cfg.cpPerDollar, 10000);
eq("…and the shipped ceiling", cfg.ceiling, 500);

const max = maxDailyCp(cfg);
eq("the per-action table sums to 1330", max.table, 1330);
eq("the ceiling is what a gamer can actually be credited", max.capped, 500);
ok("nothing is uncapped", !max.uncapped);
ok("the ceiling is doing work — it is below the table", exposure(cfg).ceilingHolds);
eq("no open liabilities", exposure(cfg).uncapped, []);

// The numbers this item exists to produce.
eq("worst case at 1,000 gamers is $50/day", maxDailyCost(cfg, 1_000), 50);
eq("…at 100,000, $5,000/day", maxDailyCost(cfg, 100_000), 5_000);
eq("…at 1,000,000, $50,000/day", maxDailyCost(cfg, 1_000_000), 50_000);
// For contrast, the state B34 found: 1,255 CP/day at 1,000 CP = $1.
ok("the old rate would have cost 10× the new one at the same table",
  maxDailyCost({ ...cfg, cpPerDollar: 1000 }, 1_000_000) === maxDailyCost(cfg, 1_000_000) * 10);

// Worst case and forecast must never be the same number.
const expected = expectedDailyCost(cfg, 1_000_000, DEFAULT_ASSUMPTIONS);
ok("the forecast is well under the worst case", expected < maxDailyCost(cfg, 1_000_000),
  `expected=${expected}`);
eq("…and is exactly dailyActive × capReach of it",
  Math.round(expected), Math.round(50_000 * DEFAULT_ASSUMPTIONS.dailyActive * DEFAULT_ASSUMPTIONS.capReach));

console.log("\n== the model refuses to hide an open liability ==");
// `message_new`, not `write_comment`: B61 retired posts, comments and reactions
// from the quest actions (weight 0), and an action that pays nothing cannot
// demonstrate an unbounded liability. The FIXTURE was wrong after the reprice,
// not the assertion — which is the whole point of this block.
const holed = { ...cfg, actions: cfg.actions.map((a) => a.key === "message_new" ? { ...a, cap: 0 } : a) };
const holedMax = maxDailyCp(holed);
ok("an uncapped action makes the table unbounded", holedMax.uncapped && holedMax.table === Infinity);
eq("…but the ceiling still bounds what a gamer gets", holedMax.capped, 500);
eq("…and it is named as a liability", exposure(holed).uncapped.map((l) => l.key), ["message_new"]);
ok("…with a reason that says it can eat the whole day",
  /whole day/.test(exposure(holed).uncapped[0].why));
const noCeiling = { ...holed, ceiling: 0 };
eq("with no ceiling either, the worst case is honestly infinite",
  maxDailyCost(noCeiling, 1_000_000), Infinity);
ok("…and the reason says so", /unbounded/.test(exposure(noCeiling).uncapped[0].why));

// The B34.2 correction, asserted in the MODEL as well as the engine: an action
// on two quests must not multiply the cost.
console.log("\n== the model does not resurrect the multiplier ==");
const twoQuests = { ...cfg, actions: cfg.actions.map((a) =>
  a.key === "ad_impression" ? { ...a, quests: ["signal", "orbit"] } : a) };
eq("listing an action on two quests does not double the table",
  maxDailyCp(twoQuests).table, maxDailyCp(cfg).table);
// B61 repriced this; the assertion is about the MULTIPLIER, not the price.
eq("…nor what that one action pays",
  actionMaxDaily(twoQuests.actions.find((a) => a.key === "ad_impression")!), 25);

console.log("\n== the abuse surface ==");
const surface = abuseSurface(cfg);
ok("the free surface is ranked by CP per minute",
  surface.every((r, i) => i === 0 || surface[i - 1].cpPerMinute >= r.cpPerMinute));
ok("winning a challenge is NOT on the free surface — it needs a game and a result",
  !surface.some((r) => r.key === "win_challenge"));
// `message_new`, not `write_comment`: B61 retired the posting actions, and a
// retired action is not on the abuse surface because it pays nothing. The
// surface still has to contain the cheap social ones.
ok("messaging a new gamer IS", surface.some((r) => r.key === "message_new"));
const mpd = minutesPerDollar(cfg)!;
// CAP-AWARE now. The old figure took the fastest action and ignored its cap,
// which answered a question about a platform we do not run: it read 27 minutes
// when clicking an ad is capped at 3 a day. Filling a day with every self-serve
// action, under the ceiling, is ~6 hours of work per dollar.
ok("a determined faker needs hours per dollar, not minutes", mpd > 60, `${mpd.toFixed(0)} min/$`);
ok("…and the single-action figure is kept for pricing ONE action, gating nothing",
  (fastestActionMinutesPerDollar(cfg) ?? 0) > 0);
console.log(`       (cheapest path: ${surface[0].label} at ${surface[0].cpPerMinute.toFixed(1)} CP/min → ${(mpd / 60).toFixed(1)} hours per dollar)`);

// The plan's load-bearing bullet for B16.2: "assert through the real award
// path, not the settings row." A calculator that writes somewhere the engine
// does not read is the most dangerous kind of admin page, because it looks like
// it worked.
console.log("\n== what the calculator writes is what the engine pays ==");
const [conquest] = await db.select().from(schema.quests).where(sqlEq(schema.quests.key, "conquest")).limit(1);
const conqW = { ...(conquest.actionWeights as Record<string, number>) };
const conqC = { ...(conquest.dailyCaps as Record<string, number>) };
// Exactly the write saveCpConfig performs: the quest's own maps.
await db.update(schema.quests)
  .set({ actionWeights: { ...conqW, join_challenge: 7 }, dailyCaps: { ...conqC, join_challenge: 3 } })
  .where(sqlEq(schema.quests.id, conquest.id));
const retuned = await newGamer("retuned");
await awardQuestAction(db, retuned, "join_challenge", { refType: "ch", refId: "a" });
eq("a weight written to the quest is the weight the engine pays", await cpToday(retuned), 7);
for (const r of ["b", "c", "d"]) await awardQuestAction(db, retuned, "join_challenge", { refType: "ch", refId: r });
eq("…and the cap written beside it is the cap it enforces", await cpToday(retuned), 21);
await db.update(schema.quests).set({ actionWeights: conqW, dailyCaps: conqC })
  .where(sqlEq(schema.quests.id, conquest.id));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
