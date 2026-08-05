// B18 — the wallet reconciles, or it is lying to somebody about their money.
//
// Money-touching, so it is written with the item (§1.1). The assertion that
// matters most is not that a number renders — it is that the ledger's signed CP
// rows sum to the same balance the wallet claims. A statement that does not
// add up is worse than no statement, because it looks authoritative.
//
//   DEMO_DB=1 npx tsx tests/db/wallet.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { getWallet, reconciles } = await import("../../lib/wallet.ts");
const { cpWallet, cpPerDollar, priceOf } = await import("../../lib/marketplace.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

const db = await getDb();

const mkUser = async (tag: string) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, slug: `w-${tag}-${id.slice(0, 6)}`, displayName: `W ${tag}`,
    email: `${id}@test.invalid`, passwordHash: "x",
  } as never);
  return id;
};
const grant = async (userId: string, cp: number, action = "win_challenge") => {
  const [q] = await db.select({ id: schema.quests.id }).from(schema.quests).limit(1);
  await db.insert(schema.questEvents).values({
    id: uid(), userId, questId: q.id, actionKey: action,
    qpAwarded: 0, cpAwarded: cp, refType: "wallet-test", refId: uid(),
  } as never);
};

console.log("== an empty wallet is honest, not broken ==");
const fresh = await mkUser("fresh");
const w0 = await getWallet(db, fresh);
eq("nothing earned", w0.earned, 0);
eq("nothing to spend", w0.balance, 0);
eq("worth nothing", w0.balanceUsd, 0);
eq("no ledger", w0.ledger.length, 0);
ok("…and it still reconciles", reconciles(w0));
const anon = await getWallet(db, null);
eq("a signed-out visitor gets an empty wallet, not a throw", anon.balance, 0);

console.log("\n== points in ==");
const g = await mkUser("gamer");
await grant(g, 300);
await grant(g, 200, "connect_account");
const w1 = await getWallet(db, g);
eq("earned is the sum of what was paid", w1.earned, 500);
eq("balance equals earned with nothing spent", w1.balance, 500);
eq("two ledger rows", w1.ledger.length, 2);
ok("…both positive and both CP", w1.ledger.every((r) => r.kind === "cp_in" && r.cp > 0));
ok("…each naming the action in the gamer's terms",
  w1.ledger.some((r) => /win a challenge/i.test(r.label)), JSON.stringify(w1.ledger.map((r) => r.label)));

console.log("\n== the dollar value is beside the points, and it is right ==");
const rate = await cpPerDollar(db);
eq("the wallet reports the platform rate", w1.cpPerDollar, rate);
eq("…and the balance in dollars is balance / rate",
  w1.balanceUsd, Math.round((500 / rate) * 100) / 100);

console.log("\n== points out, and it still reconciles ==");
const [trophy] = await db.select().from(schema.trophies).limit(1);
const price = priceOf(trophy, rate);
await grant(g, price);                              // enough to buy it
await db.insert(schema.marketplaceOrders).values({
  id: uid(), buyerId: g, recipientId: g, trophyId: trophy.id,
  cpSpent: price, value: trophy.value, kind: "self", status: "complete",
} as never);
const w2 = await getWallet(db, g);
eq("spent is what the order cost", w2.spent, price);
eq("balance is earned minus spent", w2.balance, w2.earned - w2.spent);
ok("the purchase is a NEGATIVE CP row", w2.ledger.some((r) => r.kind === "cp_out" && r.cp === -price));
ok("…named after the trophy", w2.ledger.some((r) => r.label.includes(trophy.name)));
ok("THE LEDGER RECONCILES against the wallet", reconciles(w2),
  JSON.stringify({ earned: w2.earned, spent: w2.spent, balance: w2.balance }));
// The independent check: the wallet's own numbers and the ledger's are computed
// by different code paths and must agree.
const direct = await cpWallet(db, g);
eq("…and agrees with cpWallet, which computes it separately",
  [w2.earned, w2.spent, w2.balance], [direct.earned, direct.spent, direct.balance]);

console.log("\n== a trophy is not a points movement ==");
// This is the distinction the two columns exist for: a trophy arriving is worth
// dollars, not points, and folding it into one "amount" would break the balance.
const trophyRows = w2.ledger.filter((r) => r.kind.startsWith("trophy"));
ok("trophy rows carry no CP", trophyRows.every((r) => r.cp === 0));
ok("CP rows carry no dollars", w2.ledger.filter((r) => r.kind.startsWith("cp")).every((r) => r.usd === 0));

console.log("\n== a bought trophy appears ONCE ==");
// It exists in marketplace_orders AND in user_trophies. Listing both would show
// one purchase twice, and the balance would look wrong to the person reading it.
const awardId = uid();
await db.insert(schema.userTrophies).values({
  id: awardId, userId: g, trophyId: trophy.id, placement: 1, status: "held",
} as never);
await db.update(schema.marketplaceOrders).set({ awardId })
  .where(sqlEq(schema.marketplaceOrders.buyerId, g));
const w3 = await getWallet(db, g);
const named = w3.ledger.filter((r) => r.label.includes(trophy.name));
eq("one line for one purchase", named.length, 1);
eq("…and it is the one that carries the price", named[0].kind, "cp_out");

console.log("\n== a gift is a trophy in, and it cost the receiver nothing ==");
const giver = await mkUser("giver");
const friend = await mkUser("friend");
await db.insert(schema.marketplaceOrders).values({
  id: uid(), buyerId: giver, recipientId: friend, trophyId: trophy.id,
  cpSpent: price, value: 7.5, kind: "gift", status: "complete",
} as never);
const wf = await getWallet(db, friend);
ok("the receiver sees a trophy in", wf.ledger.some((r) => r.kind === "trophy_in"));
eq("…worth what it was worth", wf.ledger.find((r) => r.kind === "trophy_in")?.usd, 7.5);
eq("…and it cost them no points", wf.spent, 0);
const wg = await getWallet(db, giver);
ok("the giver sees the points leave", wg.ledger.some((r) => r.kind === "cp_out" && r.cp === -price));
ok("…labelled as a gift", wg.ledger.some((r) => /gifted/i.test(r.label)), JSON.stringify(wg.ledger.map((r) => r.label)));

console.log("\n== trophies out ==");
await db.insert(schema.trophyRedeems).values({
  id: uid(), userId: g, awardIds: [awardId], amount: 12.5, currency: "USD",
  method: "bank", status: "pending",
} as never);
const w4 = await getWallet(db, g);
const out = w4.ledger.find((r) => r.kind === "trophy_out");
ok("a redemption is a trophy OUT", !!out);
eq("…for a negative amount", out?.usd, -12.5);
eq("…and its state is the detail", out?.detail, "pending");
ok("…and it moved no points", out?.cp === 0);

console.log("\n== held value is only what is still held ==");
eq("one trophy held", w4.trophiesHeld, 1);
eq("…worth its current value", w4.trophyValue, Math.round(Number(trophy.value) * 100) / 100);

console.log("\n== no payment detail, in any state ==");
// There is none to leak — we hold a preference word and an opaque handle
// (docs/PAYMENTS.md) — so this asserts the wallet never grew one.
const blob = JSON.stringify(w4);
for (const bad of ["iban", "routing", "accountNumber", "account_number", "cardNumber", "last4", "sortCode"]) {
  ok(`no "${bad}" anywhere in the wallet`, !new RegExp(bad, "i").test(blob));
}

console.log("\n== newest first ==");
const times = w4.ledger.map((r) => new Date(r.at).getTime());
ok("the ledger is ordered newest first",
  times.every((t, i) => i === 0 || times[i - 1] >= t));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
