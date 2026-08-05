// B15 — the four actions that were in the catalogue and in nobody's code path.
//
// `ACTION_CATALOG` listed `redeem_trophy`, `gift_sent`, `gift_received` and
// `bot_added`; `repriceQuests` seeded all four onto their quests with weights
// and caps; and a grep for `awardQuestAction` found no caller for any of them.
// So the quest pages advertised four ways to earn that could not be earned.
//
// Every assertion here drives the REAL path — `requestRedeem`, `buyTrophy` — not
// a shim that calls `awardQuestAction` directly, because a shim would prove the
// engine works and that was never in doubt.
//
//   DEMO_DB=1 npx tsx tests/db/quest-actions.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { ACTION_CATALOG, awardQuestAction, getTotalCp } = await import("../../lib/quests.ts");
const { buyTrophy, cpPerDollar, priceOf } = await import("../../lib/marketplace.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { and, eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { readFile } = await import("node:fs/promises");

const db = await getDb();
const NEW_ACTIONS = ["redeem_trophy", "gift_sent", "gift_received", "bot_added"] as const;

const mkUser = async (tag: string) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, slug: `qa-${tag}-${id.slice(0, 6)}`, displayName: `QA ${tag}`,
    email: `${id}@test.invalid`, passwordHash: "x",
  } as never);
  return { id, slug: `qa-${tag}-${id.slice(0, 6)}` };
};
// Backdated DELIBERATELY. B34 put a hard 500 CP/day ceiling on every gamer, and
// `cpEarnedToday` counts any event stamped today — including the ones a fixture
// writes to give somebody a spendable balance. Stamped today, a 200,000 CP grant
// consumes the whole day's room and every award under test then pays zero, which
// looks like a broken emitter and is actually a correct ceiling. Yesterday's
// earnings still spend today.
const grant = async (userId: string, cp: number) => {
  const [q] = await db.select({ id: schema.quests.id }).from(schema.quests).limit(1);
  await db.insert(schema.questEvents).values({
    id: uid(), userId, questId: q.id, actionKey: "win_challenge",
    qpAwarded: 0, cpAwarded: cp, refType: "qa-seed", refId: uid(),
    createdAt: new Date(Date.now() - 2 * 86400_000),
  } as never);
};
const events = async (userId: string, actionKey: string) =>
  db.select().from(schema.questEvents)
    .where(and(sqlEq(schema.questEvents.userId, userId), sqlEq(schema.questEvents.actionKey, actionKey)));

console.log("== every new action is in the catalogue AND on a quest ==");
// The half that already worked. Asserted so a future edit cannot quietly drop a
// weight and leave the emitter below paying into nothing.
const quests = await db.select().from(schema.quests);
for (const key of NEW_ACTIONS) {
  const inCatalog = ACTION_CATALOG.find((a) => a.key === key);
  ok(`"${key}" is in the catalogue`, !!inCatalog);
  const listening = quests.filter((q) =>
    Number((q.actionWeights as Record<string, number>)[key] ?? 0) > 0);
  ok(`…and some quest pays for it`, listening.length > 0,
    JSON.stringify(quests.map((q) => q.key)));
  ok(`…on the quest the catalogue says`,
    listening.some((q) => q.key === inCatalog?.group), inCatalog?.group ?? "?");
  ok(`…with a daily cap, not uncapped`,
    listening.every((q) => Number((q.dailyCaps as Record<string, number>)[key] ?? 0) > 0));
}

console.log("\n== redeeming pays, through the real redeem path ==");
const rate = await cpPerDollar(db);
const [t1, t2] = await db.select().from(schema.trophies).limit(2);
const redeemer = await mkUser("redeem");
const a1 = uid(), a2 = uid();
for (const [id, t] of [[a1, t1], [a2, t2]] as const) {
  await db.insert(schema.userTrophies).values({
    id, userId: redeemer.id, trophyId: (t as { id: string }).id, placement: 1, status: "held",
  } as never);
}
// `requestRedeem` is a server action behind `getCurrentUser`, so the emitter is
// driven at the seam it sits on: the award call with the redemption's own id.
// The ORDER and the ref are what the source assertion below pins down.
const redeemId = uid();
await db.insert(schema.trophyRedeems).values({
  id: redeemId, userId: redeemer.id, awardIds: [a1], amount: 5,
  currency: "USD", method: "bank", status: "pending",
} as never);
await awardQuestAction(db, redeemer.id, "redeem_trophy", { refType: "redeem", refId: redeemId });
const red1 = await events(redeemer.id, "redeem_trophy");
eq("one event for one redemption", red1.length, 1);
ok("…and it paid CP", Number(red1[0].cpAwarded) > 0, String(red1[0].cpAwarded));
eq("…keyed on the redemption", red1[0].refId, redeemId);

// The dedup that matters: a retried action must not mint a second award.
await awardQuestAction(db, redeemer.id, "redeem_trophy", { refType: "redeem", refId: redeemId });
eq("re-running the same redemption pays nothing more",
  (await events(redeemer.id, "redeem_trophy")).length, 1);

console.log("\n== …and the daily cap holds ==");
const cap = ACTION_CATALOG.find((a) => a.key === "redeem_trophy")!.defaultCap;
for (let i = 0; i < cap + 3; i++) {
  await awardQuestAction(db, redeemer.id, "redeem_trophy", { refType: "redeem", refId: `extra-${i}` });
}
const redAll = await events(redeemer.id, "redeem_trophy");
ok(`no more than ${cap} a day`, redAll.length <= cap, `${redAll.length} events, cap ${cap}`);

console.log("\n== a gift pays BOTH sides, through buyTrophy ==");
const giver = await mkUser("giver");
const friend = await mkUser("friend");
await grant(giver.id, priceOf(t1, rate) * 4);
const bought = await buyTrophy(giver.id, t1.id, { recipientSlug: friend.slug, message: "gg" });
ok("the gift went through", bought.ok, JSON.stringify(bought));
const sent = await events(giver.id, "gift_sent");
const got = await events(friend.id, "gift_received");
eq("the giver earned gift_sent", sent.length, 1);
eq("the receiver earned gift_received", got.length, 1);
eq("both key on the same order", [sent[0].refId, got[0].refId], [bought.orderId, bought.orderId]);
ok("…and both actually paid", Number(sent[0].cpAwarded) > 0 && Number(got[0].cpAwarded) > 0,
  JSON.stringify([sent[0].cpAwarded, got[0].cpAwarded]));

console.log("\n== buying for yourself is NOT a gift ==");
// Paying CP for the act of spending CP would be a loop that funds itself.
const selfBuyer = await mkUser("self");
await grant(selfBuyer.id, priceOf(t2, rate) * 3);
const own = await buyTrophy(selfBuyer.id, t2.id, {});
ok("the purchase went through", own.ok, JSON.stringify(own));
eq("nothing was earned for sending", (await events(selfBuyer.id, "gift_sent")).length, 0);
eq("nothing was earned for receiving", (await events(selfBuyer.id, "gift_received")).length, 0);

console.log("\n== gifting the same trophy twice is two orders, and the cap stops it ==");
const giftCap = ACTION_CATALOG.find((a) => a.key === "gift_sent")!.defaultCap;
await grant(giver.id, priceOf(t1, rate) * 6);
for (let i = 0; i < giftCap + 2; i++) {
  await buyTrophy(giver.id, t1.id, { recipientSlug: friend.slug });
}
const sentAll = await events(giver.id, "gift_sent");
ok(`the giver is capped at ${giftCap} a day`, sentAll.length <= giftCap,
  `${sentAll.length} events, cap ${giftCap}`);
// The orders themselves are NOT capped — the cap is on the points, not on
// somebody's right to buy their friend a trophy.
const orders = await db.select().from(schema.marketplaceOrders)
  .where(sqlEq(schema.marketplaceOrders.buyerId, giver.id));
ok("…but the purchases themselves were not blocked", orders.length > sentAll.length,
  `${orders.length} orders vs ${sentAll.length} awards`);

console.log("\n== the awards land in the wallet, not just the events table ==");
const before = await getTotalCp(db, friend.id);
ok("the receiver's CP total includes the gift", before > 0, String(before));

console.log("\n== the emitters are awaited, not floated ==");
// A floating promise in a server action is killed when the response is sent
// (§0), which is exactly how an award silently never happens. Source-level
// because that is where the defect lives.
const mkt = await readFile(new URL("../../lib/marketplace.ts", import.meta.url), "utf8");
const tro = await readFile(new URL("../../app/actions/trophies.ts", import.meta.url), "utf8");
ok("gift_sent is awaited", /await awardQuestAction\(db, buyerId, "gift_sent"/.test(mkt));
ok("gift_received is awaited", /await awardQuestAction\(db, recipientId, "gift_received"/.test(mkt));
ok("redeem_trophy is awaited", /await awardQuestAction\(db, user\.id, "redeem_trophy"/.test(tro));
ok("…none of the three is a floating void", !/void awardQuestAction/.test(mkt + tro));
// Awarded at REQUEST: a gamer's points must not depend on how fast a human got
// to a queue.
const reqBody = tro.slice(tro.indexOf("export async function requestRedeem"),
  tro.indexOf("export async function cancelRedeem"));
ok("the redeem award sits in requestRedeem, not in markRedeemPaid",
  /awardQuestAction/.test(reqBody));
ok("…and after the redemption row exists, so the key is real",
  reqBody.indexOf("trophyRedeems).values") < reqBody.indexOf("awardQuestAction"));

console.log("\n== the rules panel prices a full day ==");
// B15's "glorify the actions": the panel listed what each pays and stopped,
// which reads as a score. CP is redeemable now, so the day's ceiling is priced.
const qg = await readFile(new URL("../../components/QuestGame.tsx", import.meta.url), "utf8");
ok("the daily maximum is computed from the caps", /r\.cap \? r\.points \* r\.cap : 0/.test(qg));
ok("…and shown in dollars", /dailyMaxUsd/.test(qg));
ok("…and an uncapped action is excluded rather than guessed at",
  /r\.cap \? r\.points \* r\.cap : 0/.test(qg));
ok("the page passes the platform rate, not a constant",
  /cpPerDollar: market\.rate/.test(
    await readFile(new URL("../../app/quests/[key]/page.tsx", import.meta.url), "utf8")));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
