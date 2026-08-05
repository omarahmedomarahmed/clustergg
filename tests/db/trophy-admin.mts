// B53 — admin owns every trophy, including the ones already held.
//
// Money-touching, so it is written with the item (§1.1). Two rules pull in
// opposite directions and BOTH have to hold:
//
//   1. Editing a trophy's value changes what every UNREDEEMED holding is worth.
//      That is the feature — a holding stores no value, it reads `trophies.value`
//      live.
//   2. It must NEVER move `trophy_redeems.amount` on a request that is pending,
//      approved, sent or paid. That number was written once, at request time,
//      and a person has been shown it. A payout whose value changes after it
//      left is a reconciliation failure with a real person on the other end.
//
// A guard that gets the first right and the second wrong pays somebody the
// wrong amount.
//
//   DEMO_DB=1 npx tsx tests/db/trophy-admin.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { trophyHoldings, holdersOf, canDeleteTrophy, valueImpact } =
  await import("../../lib/trophy-admin.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq, inArray } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

const db = await getDb();

const mkTrophy = async (name: string, value: number) => {
  const id = uid();
  await db.insert(schema.trophies).values({
    id, name, imageUrl: `https://example.invalid/${id}.png`, tier: "bronze", value,
  } as never);
  return id;
};
const mkUser = async (tag: string) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, slug: `ta-${tag}-${id.slice(0, 6)}`, displayName: `TA ${tag}`,
    email: `${id}@test.invalid`, passwordHash: "x",
  } as never);
  return id;
};
const award = async (userId: string, trophyId: string, status = "held") => {
  const id = uid();
  await db.insert(schema.userTrophies).values({ id, userId, trophyId, placement: 1, status } as never);
  return id;
};

console.log("== an edit reaches every holder ==");
const t1 = await mkTrophy("Original Name", 5);
const u1 = await mkUser("one");
const u2 = await mkUser("two");
await award(u1, t1);
await award(u2, t1);
// A holding stores trophyId and nothing else about the trophy, so there is
// nothing per-gamer that CAN go stale.
const holdingCols = await db.select().from(schema.userTrophies)
  .where(sqlEq(schema.userTrophies.trophyId, t1)).limit(1);
ok("a holding carries no copy of the name",
  !("name" in holdingCols[0]), Object.keys(holdingCols[0]).join(","));
ok("…nor of the image", !("imageUrl" in holdingCols[0]));
ok("…nor of the value — which is why an edit propagates for free",
  !("value" in holdingCols[0]), Object.keys(holdingCols[0]).join(","));

await db.update(schema.trophies)
  .set({ name: "Renamed", imageUrl: "https://example.invalid/new.png", title: "A Title", description: "A story." })
  .where(sqlEq(schema.trophies.id, t1));
const [edited] = await db.select().from(schema.trophies).where(sqlEq(schema.trophies.id, t1));
eq("the name changed", edited.name, "Renamed");
eq("…the title", edited.title, "A Title");
eq("…and the description", edited.description, "A story.");
// What each holder sees is a join, so both see it, without a migration.
const seen = await db.select({ name: schema.trophies.name })
  .from(schema.userTrophies)
  .innerJoin(schema.trophies, sqlEq(schema.trophies.id, schema.userTrophies.trophyId))
  .where(sqlEq(schema.userTrophies.trophyId, t1));
eq("both holders see the new name", seen.map((r) => r.name), ["Renamed", "Renamed"]);

console.log("\n== raising the value raises an UNREDEEMED holding ==");
await db.update(schema.trophies).set({ value: 25 }).where(sqlEq(schema.trophies.id, t1));
const worth = await db.select({ v: schema.trophies.value })
  .from(schema.userTrophies)
  .innerJoin(schema.trophies, sqlEq(schema.trophies.id, schema.userTrophies.trophyId))
  .where(sqlEq(schema.userTrophies.userId, u1));
eq("the holder's trophy is now worth the new value", worth[0].v, 25);

console.log("\n== but it NEVER moves a redemption that has been requested ==");
// One redemption per state that has money attached. All four must be immune.
const STATES = ["pending", "approved", "sent", "paid"] as const;
const frozen: { state: string; redeemId: string; amount: number }[] = [];
for (const state of STATES) {
  const t = await mkTrophy(`For ${state}`, 10);
  const u = await mkUser(state);
  const a = await award(u, t, "pending");
  const rid = uid();
  await db.insert(schema.trophyRedeems).values({
    id: rid, userId: u, awardIds: [a], amount: 10, currency: "USD",
    method: "bank", status: state,
  } as never);
  frozen.push({ state, redeemId: rid, amount: 10 });
  // Now the value is changed underneath it — up for two, down for two, because
  // both directions are wrong.
  await db.update(schema.trophies)
    .set({ value: state === "pending" || state === "approved" ? 999 : 1 })
    .where(sqlEq(schema.trophies.id, t));
}
const after = await db.select({ id: schema.trophyRedeems.id, amount: schema.trophyRedeems.amount, status: schema.trophyRedeems.status })
  .from(schema.trophyRedeems)
  .where(inArray(schema.trophyRedeems.id, frozen.map((f) => f.redeemId)));
for (const f of frozen) {
  const row = after.find((r) => r.id === f.redeemId);
  eq(`a ${f.state} redemption's amount is unchanged`, Number(row?.amount), f.amount);
}
ok("…including when the value went UP",
  after.filter((r) => ["pending", "approved"].includes(r.status)).every((r) => Number(r.amount) === 10));
ok("…and when it went DOWN",
  after.filter((r) => ["sent", "paid"].includes(r.status)).every((r) => Number(r.amount) === 10));

console.log("\n== the impact is stated before the edit ==");
const impact = await valueImpact(db, t1);
eq("it counts the holdings that would be revalued", impact.revalued, 2);
eq("…and reports zero in-flight redemptions on this one", impact.inFlight, 0);

console.log("\n== who holds it, how many, how many redeemed ==");
const t2 = await mkTrophy("Counted", 5);
const h1 = await mkUser("h1");
const h2 = await mkUser("h2");
const h3 = await mkUser("h3");
await award(h1, t2, "held");
await award(h2, t2, "held");
await award(h3, t2, "redeemed");
const counts = (await trophyHoldings(db)).get(t2);
eq("three hold it", counts?.holders, 3);
eq("…two still redeemable", counts?.held, 2);
eq("…one already cashed out", counts?.redeemed, 1);
const list = await holdersOf(db, t2);
eq("and they can be listed by name", list.length, 3);
ok("…with their status", list.every((h) => ["held", "redeemed"].includes(h.status)));

console.log("\n== a held trophy cannot be deleted ==");
const held = await canDeleteTrophy(db, t2);
ok("it is refused", !held.ok);
eq("…and says how many hold it", held.holders, 3);
ok("…and why", /cannot be deleted/.test(held.reason), held.reason);
// The point of refusing rather than warning: `user_trophies.trophyId` cascades
// (schema.ts:669), so the delete would silently take three profiles' trophies.
ok("…and says the alternative is to edit it", /still editable/.test(held.reason), held.reason);

const orphan = await mkTrophy("Nobody holds this", 5);
const free = await canDeleteTrophy(db, orphan);
ok("a trophy nobody holds CAN be deleted", free.ok);
eq("…with no holders", free.holders, 0);

console.log("\n== the action refuses too, not just the check ==");
// Through the real server action's guard, so the rule is not only in a helper
// nobody is obliged to call.
const src = (await import("node:fs")).readFileSync(
  new URL("../../app/actions/admin.ts", import.meta.url), "utf8");
const del = src.slice(src.indexOf("export async function deleteTrophy"));
ok("deleteTrophy calls canDeleteTrophy before deleting",
  del.indexOf("canDeleteTrophy") < del.indexOf("db.delete("),
  "the guard must run first");
ok("…and returns the reason rather than swallowing it", /return \{ error: check\.reason \}/.test(del));

// And the delete itself still works for an unheld one.
await db.delete(schema.trophies).where(sqlEq(schema.trophies.id, orphan));
const gone = await db.select().from(schema.trophies).where(sqlEq(schema.trophies.id, orphan));
eq("an unheld trophy really does delete", gone.length, 0);

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
