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
ok("no action pays nothing", ACTION_CATALOG.every((a) => a.defaultWeight > 0));
// The fixture. If this fails, somebody moved a weight — read the diff and decide
// whether they meant to, then change this number in the same commit.
eq("the per-action caps sum to exactly 624", ACTION_CAP_SUM, 624);
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
  .set({ actionWeights: { ...signalWeights, write_post: 3 }, dailyCaps: { ...signalCaps, write_post: 3 } })
  .where(sqlEq(schema.quests.id, signal.id));

const twin = await newGamer("twin");
await awardQuestAction(db, twin, "write_post", { refType: "post", refId: "p1" });
eq("an action two quests listen to pays ONCE", await cpToday(twin), 3);
const progressRows = await db.select({ questId: schema.userQuestProgress.questId, qp: schema.userQuestProgress.qp })
  .from(schema.userQuestProgress).where(sqlEq(schema.userQuestProgress.userId, twin));
eq("…and progresses BOTH quests", progressRows.length, 2);
ok("…each by the full weight", progressRows.every((r) => r.qp === 3), JSON.stringify(progressRows));
eq("getTotalCp agrees with the ledger, not with the progress rows", await getTotalCp(db, twin), 3);
const ledger = await getCpLedger(db, twin);
eq("the money log shows one line, not two", ledger.length, 1);
eq("…and it reads the CP that was paid", ledger[0]?.qp, 3);

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
eq("an action capped at 1 pays once however often it happens", await cpToday(capped), 10);

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

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
