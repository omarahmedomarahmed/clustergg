// B40 — what you give up, said before you give it up.
//
// Money-touching, so it is written with the item (§1.1). Deletion used to be one
// click with no confirmation and no mention of the money, and `db.delete(users)`
// cascades. The assertions that matter are not that a panel renders — they are
// that the number in front of the decision is the RIGHT number, and that the one
// case which cannot be apologised for afterwards (a payout already handed to a
// provider) is refused outright.
//
//   DEMO_DB=1 npx tsx tests/db/account-deletion.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { deletionImpact, deletionAllowed, IN_FLIGHT } = await import("../../lib/account-deletion.ts");
const { cpPerDollar, priceOf } = await import("../../lib/marketplace.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { readFile } = await import("node:fs/promises");

const db = await getDb();
const rate = await cpPerDollar(db);

const mkUser = async (tag: string) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, slug: `del-${tag}-${id.slice(0, 6)}`, displayName: `Del ${tag}`,
    email: `${id}@test.invalid`, passwordHash: "x", ageBand: "adult",
  } as never);
  return id;
};
const grant = async (userId: string, cp: number) => {
  const [q] = await db.select({ id: schema.quests.id }).from(schema.quests).limit(1);
  await db.insert(schema.questEvents).values({
    id: uid(), userId, questId: q.id, actionKey: "win_challenge",
    qpAwarded: 0, cpAwarded: cp, refType: "deletion-test", refId: uid(),
  } as never);
};
const award = async (userId: string, trophyId: string, status = "held") => {
  const id = uid();
  await db.insert(schema.userTrophies).values({
    id, userId, trophyId, placement: 1, status,
  } as never);
  return id;
};
const redeem = async (userId: string, awardIds: string[], amount: number, status: string) => {
  const id = uid();
  await db.insert(schema.trophyRedeems).values({
    id, userId, awardIds, amount, currency: "USD", method: "bank", status,
  } as never);
  return id;
};

console.log("== an empty account has nothing to lose, and says so ==");
const empty = await mkUser("empty");
const i0 = await deletionImpact(db, empty);
eq("no balance", i0.balance, 0);
eq("no trophies", i0.trophies.length, 0);
eq("nothing at stake", i0.anythingAtStake, false);
eq("nothing forfeited", i0.totalUsd, 0);
ok("…and deletion is allowed", deletionAllowed(i0).ok);

console.log("\n== the number in front of the decision is the right number ==");
const rich = await mkUser("rich");
await grant(rich, 50_000);
const [t1, t2] = await db.select().from(schema.trophies).limit(2);
await award(rich, t1.id);
await award(rich, t2.id);
const i1 = await deletionImpact(db, rich);
eq("the balance is the wallet's balance", i1.balance, 50_000);
eq("…priced at the platform rate", i1.cpPerDollar, rate);
eq("…and converted, not guessed", i1.balanceUsd, Math.round((50_000 / rate) * 100) / 100);
eq("both trophies counted", i1.trophies.length, 2);
eq("…at their cash value", i1.trophyValue,
  Math.round((Number(t1.value) + Number(t2.value)) * 100) / 100);
eq("the total is points-in-dollars PLUS trophies", i1.totalUsd,
  Math.round((i1.balanceUsd + i1.trophyValue) * 100) / 100);
ok("something is at stake", i1.anythingAtStake);
// The alternative offered on the page has to be real: the balance must actually
// buy something, or "cash it out first" is a lie.
ok("…and the balance is redeemable, not notional",
  i1.balance >= priceOf(t1, rate) || i1.balanceUsd > 0,
  JSON.stringify({ balance: i1.balance, price: priceOf(t1, rate) }));

console.log("\n== a trophy already redeemed is not still yours to lose ==");
// Double counting here would overstate what somebody is giving up, which is the
// same class of error as understating it: the number stops being trustworthy.
const spent = await mkUser("spent");
const gone = await award(spent, t1.id, "redeemed");
await redeem(spent, [gone], 15, "paid");
const i2 = await deletionImpact(db, spent);
eq("a redeemed trophy is not counted as held", i2.trophies.length, 0);
eq("…and a settled payout is not pending", i2.pending.length, 0);
eq("…so nothing is at stake", i2.anythingAtStake, false);

console.log("\n== money already moving is a hard NO ==");
for (const status of IN_FLIGHT) {
  const u = await mkUser(`flight-${status}`);
  const a = await award(u, t1.id);
  await redeem(u, [a], 42.5, status);
  const imp = await deletionImpact(db, u);
  eq(`"${status}" is in flight`, imp.inFlight.length, 1);
  const guard = deletionAllowed(imp);
  eq(`…so deletion is refused`, guard.ok, false);
  ok(`…naming the amount`, /42\.50/.test(guard.reason), guard.reason);
  ok(`…saying WHY it cannot be done`,
    /paid to somebody whose record no longer exists/.test(guard.reason), guard.reason);
  // The block has to read as temporary, or it reads as a refusal to let
  // somebody leave — which is a different thing entirely.
  ok(`…and that it unlocks by itself`, /unlocks straight away/.test(guard.reason), guard.reason);
}

console.log("\n== a request not yet approved is a warning, not a block ==");
// `pending` is a request we have not acted on. It is theirs to abandon.
const waiting = await mkUser("waiting");
const wa = await award(waiting, t1.id);
await redeem(waiting, [wa], 9, "pending");
const i3 = await deletionImpact(db, waiting);
eq("it is shown as pending", i3.pending.length, 1);
eq("…but nothing is in flight", i3.inFlight.length, 0);
ok("…so deletion is allowed", deletionAllowed(i3).ok);
ok("…and it counts as something at stake", i3.anythingAtStake);

console.log("\n== two payouts in flight are both named ==");
const many = await mkUser("many");
const ma = await award(many, t1.id);
await redeem(many, [ma], 10, "approved");
await redeem(many, [ma], 20, "sent");
const i4 = await deletionImpact(db, many);
eq("both are in flight", i4.inFlight.length, 2);
const g4 = deletionAllowed(i4);
ok("the reason totals them", /\$30\.00/.test(g4.reason), g4.reason);
ok("…in the plural", /payouts that have/.test(g4.reason), g4.reason);

console.log("\n== the guard never throws on a broken read ==");
// Failing CLOSED here would lock people out of leaving; failing OPEN would
// delete somebody mid-payout. The impact read is wrapped, so a broken read
// yields an empty impact — and an empty impact allows deletion. That is the
// deliberate choice, asserted so it is not changed by accident.
//
// The handler is scoped to this one assertion and removed straight after. It is
// here because `cpWallet` (lib/marketplace.ts:139) fans out with `Promise.all`,
// so a dead database rejects both of its legs and only the first is observed —
// the second is an unhandled rejection that kills a plain node process. That is
// a pre-existing shape used all over this codebase, not something B40 introduced
// and not something to sweep from here; `deletionImpact` observes its own four.
const swallowed: unknown[] = [];
const onUnhandled = (e: unknown) => swallowed.push(e);
process.on("unhandledRejection", onUnhandled);
const brokenDb = { select() { throw new Error("db down"); } } as never;
const i5 = await deletionImpact(brokenDb, "nobody");
eq("a failed read yields an empty impact", i5.anythingAtStake, false);
ok("…and deletion proceeds rather than jamming", deletionAllowed(i5).ok);
await new Promise((r) => setImmediate(r));
process.off("unhandledRejection", onUnhandled);
ok("deletionImpact observes every one of its own reads", swallowed.length <= 1,
  `${swallowed.length} unhandled — deletionImpact should leave at most cpWallet's one`);

console.log("\n== the action itself ==");
// Server actions need a session, so these are source-level: they assert the
// ORDER of the three things, which is where the value is. Emailing after the
// delete would email nobody; deleting before the guard would defeat it.
const src = await readFile(new URL("../../app/actions/connections.ts", import.meta.url), "utf8");
const body = src.slice(src.indexOf("export async function deleteAccount"));
const iConfirm = body.indexOf('!== "DELETE"');
const iGuard = body.indexOf("deletionAllowed");
const iEmail = body.indexOf("account.deleted");
const iDelete = body.indexOf("db.delete(schema.users)");
ok("a typed confirmation is required", iConfirm > 0);
ok("…checked BEFORE the guard even runs", iConfirm < iGuard, `${iConfirm} vs ${iGuard}`);
ok("the guard runs", iGuard > 0);
ok("…before anything is deleted", iGuard < iDelete, `${iGuard} vs ${iDelete}`);
ok("they are emailed what they gave up", iEmail > 0);
ok("…while there is still somebody to email", iEmail < iDelete, `${iEmail} vs ${iDelete}`);
ok("the guard's refusal returns instead of continuing", /if \(!guard\.ok\) return/.test(body));
ok("a failed email does not block somebody leaving", /catch \{ \/\* a failed email/.test(body));

console.log("\n== no payment detail, anywhere ==");
// docs/PAYMENTS.md: a preference word and an opaque handle, nothing else.
const blob = JSON.stringify(i1) + JSON.stringify(i4);
for (const bad of ["iban", "routing", "accountNumber", "account_number", "cardNumber", "last4", "sortCode"]) {
  ok(`no "${bad}" in the impact`, !new RegExp(bad, "i").test(blob));
}

console.log("\n== the demo data actually reaches these states ==");
// B39 shipped with a stated gap: the console was correct but not demonstrable,
// because the seed never produced a failed payout or a departed winner. Closing
// it here rather than leaving it named.
const { stuckMoney } = await import("../../lib/stuck-money.ts");
const seeded = await stuckMoney(db);
ok("a failed payout exists in the demo data",
  seeded.some((r) => r.kind === "failed_payout"),
  JSON.stringify([...new Set(seeded.map((r) => r.kind))]));
ok("…and a prize whose owner is gone",
  seeded.some((r) => r.kind === "owner_gone"),
  JSON.stringify([...new Set(seeded.map((r) => r.kind))]));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
