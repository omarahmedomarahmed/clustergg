// B17 — no interruption, full disclosure.
//
// The cap half is enforcement (B34 built it); this file holds the half that
// makes it humane. Past the cap the underlying action still succeeds and simply
// stops earning, nothing errors, and anybody who goes looking finds the exact
// figure and the reset.
//
//   DEMO_DB=1 npx tsx tests/db/caps.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { awardQuestAction, capsToday, cpEarnedToday, getUserQuests } = await import("../../lib/quests.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

const db = await getDb();
const id = uid();
await db.insert(schema.users).values({
  id, slug: `caps-${id.slice(0, 6)}`, displayName: "Caps", email: `${id}@test.invalid`, passwordHash: "x",
} as never);

console.log("== past the cap, the action still works ==");
// join_planet pays 10 and caps at 1.
let threw = false;
try {
  for (let i = 0; i < 4; i++) await awardQuestAction(db, id, "join_planet", { refType: "pl", refId: `p${i}` });
} catch { threw = true; }
ok("awarding past the cap does not throw", !threw);
eq("…and pays exactly the cap, not four times it", await cpEarnedToday(db, id), 10);

console.log("\n== and it is disclosed, exactly ==");
const caps = await capsToday(db, id);
const planet = caps.actions.find((a) => a.key === "join_planet");
ok("the maxed action is listed", !!planet);
eq("…with the real figure", [planet?.used, planet?.cap], [1, 1]);
ok("…and marked maxed", !!planet?.maxed);
ok("maxed actions sort first", caps.actions[0]?.maxed !== false);
eq("what has been earned today is stated", caps.earned, 10);
eq("…against the ceiling", caps.ceiling, 500);
ok("the ceiling is not hit on ten points", !caps.ceilingHit);

// The reset is UTC midnight — the same boundary the engine counts from, or the
// figure shown and the figure enforced drift apart once a day.
const reset = new Date(caps.resetsAt);
eq("the reset is at a UTC midnight",
  [reset.getUTCHours(), reset.getUTCMinutes(), reset.getUTCSeconds()], [0, 0, 0]);
ok("…and it is in the future", reset.getTime() > Date.now());

console.log("\n== an uncapped action has no figure to disclose ==");
const [orbit] = await db.select().from(schema.quests).where(sqlEq(schema.quests.key, "orbit")).limit(1);
const w = { ...(orbit.actionWeights as Record<string, number>) };
const c = { ...(orbit.dailyCaps as Record<string, number>) };
await db.update(schema.quests).set({ dailyCaps: { ...c, write_post: 0 } })
  .where(sqlEq(schema.quests.id, orbit.id));
await awardQuestAction(db, id, "write_post", { refType: "post", refId: "x1" });
const uncappedCaps = await capsToday(db, id);
ok("an uncapped action is not shown with a made-up limit",
  !uncappedCaps.actions.some((a) => a.key === "write_post"));
await db.update(schema.quests).set({ actionWeights: w, dailyCaps: c }).where(sqlEq(schema.quests.id, orbit.id));

console.log("\n== the cap is stated up front, before it is reached ==");
// Every rule a quest card renders carries its cap, so a gamer reads the limit
// when they start rather than discovering it when it bites.
const quests = await getUserQuests(db, id);
const rules = quests.flatMap((q) => q.rules);
ok("every quest has scoring rules to show", rules.length > 0);
const capless = rules.filter((r) => !r.cap).map((r) => r.key);
eq("no rule is rendered without its daily cap", capless, []);

console.log("\n== the ceiling is disclosed too ==");
const heavy = uid();
await db.insert(schema.users).values({
  id: heavy, slug: `caps2-${heavy.slice(0, 6)}`, displayName: "Heavy",
  email: `${heavy}@test.invalid`, passwordHash: "x",
} as never);
const [wide] = await db.select().from(schema.quests).where(sqlEq(schema.quests.key, "orbit")).limit(1);
const wW = { ...(wide.actionWeights as Record<string, number>) };
const wC = { ...(wide.dailyCaps as Record<string, number>) };
await db.update(schema.quests)
  .set({ actionWeights: { ...wW, write_comment: 25 }, dailyCaps: { ...wC, write_comment: 999 } })
  .where(sqlEq(schema.quests.id, wide.id));
for (let i = 0; i < 25; i++) await awardQuestAction(db, heavy, "write_comment", { refType: "c", refId: `k${i}` });
const hit = await capsToday(db, heavy);
eq("a gamer at the ceiling is credited exactly it", hit.earned, 500);
ok("…and the panel says the ceiling is reached", hit.ceilingHit);
// The point of B17: reaching it changes nothing about whether the action works.
let threw2 = false;
try { await awardQuestAction(db, heavy, "write_comment", { refType: "c", refId: "after" }); } catch { threw2 = true; }
ok("awarding past the CEILING does not throw either", !threw2);
eq("…and still credits nothing more", (await capsToday(db, heavy)).earned, 500);
await db.update(schema.quests).set({ actionWeights: wW, dailyCaps: wC }).where(sqlEq(schema.quests.id, wide.id));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
