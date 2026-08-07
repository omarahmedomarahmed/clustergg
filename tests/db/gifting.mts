// B72.3 — gifting is DELETED, and this file exists to keep it deleted.
//
// It used to test the gift flow: which accounts the type-ahead would name, what
// fields left the server, and that a second tab could not spend the same points
// twice. That last one is not lost — it moved to `tests/db/concurrency.mts`,
// where it is checked against a real Postgres under real contention rather than
// as a side effect of a gift.
//
// What replaces it is the opposite assertion. A trophy redeems for cash, so
// handing one to another account moved real value between two people: a
// money-transmission trigger, a 1099 aggregation hole, and a way for an
// under-18 who cannot redeem to pass value to somebody who can. One deletion
// closed all three, and this file is what stops any of it coming back through
// a helpful re-addition.
//
// Several assertions read SOURCE rather than call a function, deliberately.
// "There is no way to give a trophy to somebody else" is a claim about the
// code; a runtime check can only prove that one path refuses.
//
//   DEMO_DB=1 npx tsx tests/db/gifting.mts

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

const exists = (p: string) => { try { readFileSync(new URL(`../../${p}`, import.meta.url)); return true; } catch { return false; } };
const code = (p: string) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

const { buyTrophy, cpPerDollar, priceOf } = await import("../../lib/marketplace.ts");
const { ACTION_CATALOG } = await import("../../lib/quests.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

const db = await getDb();
const rate = await cpPerDollar(db);

console.log("== a purchase cannot name anybody but the buyer ==");
{
  // The signature, not the behaviour. `buyTrophy` used to take
  // `{ recipientSlug, message }`; removing the parameter is what makes it
  // impossible to reintroduce gifting by passing an argument, and means no
  // reviewer has to check whether some caller does.
  eq("buyTrophy takes exactly two arguments", buyTrophy.length, 2);
  const src = code("lib/marketplace.ts");
  // Narrowed on purpose after this failed as first written. `recipientSlug`
  // DOES survive in this file — on `MarketOrder`, the admin ledger's read
  // model, because orders written before the deletion have a recipient who is
  // not the buyer. Rewriting those as self-purchases would be falsifying
  // history to make the present look tidy. What must not survive is any way to
  // pass one IN.
  ok("…and buyTrophy accepts no recipient",
    !/recipientSlug\??:/.test(src.slice(src.indexOf("export async function buyTrophy"), src.indexOf("export type MarketOrder"))));
  ok("the order is always kind:self", /kind: "self"/.test(src) && !/kind: giftedTo/.test(src));
  ok("no gift notification is written", !/trophy_gift/.test(src));
}

console.log("\n== a bought trophy lands on the BUYER, whatever the caller wants ==");
{
  const tag = uid().slice(0, 6);
  const buyer = uid();
  const other = uid();
  for (const [id, n] of [[buyer, "Buyer"], [other, "Other"]] as const) {
    await db.insert(schema.users).values({
      id, email: `${id}@gift.test`, displayName: `${n} ${tag}`, slug: `${n.toLowerCase()}-${tag}`,
      passwordHash: "x", role: "user", status: "active",
    });
  }
  const trophyId = uid();
  await db.insert(schema.trophies).values({
    id: trophyId, name: `Gift Test ${tag}`, imageUrl: "/x.png", value: "0", inMarketplace: true,
  });
  const price = priceOf({ value: "0" } as never, rate);
  const [quest] = await db.select().from(schema.quests).limit(1);
  await db.insert(schema.questEvents).values({
    id: uid(), userId: buyer, questId: quest.id, actionKey: "manual",
    qpAwarded: 0, cpAwarded: price, refType: "seed", refId: "funding",
  });

  const res = await buyTrophy(buyer, trophyId);
  ok("the purchase succeeds", res.ok === true, JSON.stringify(res));

  const held = await db.select({ userId: schema.userTrophies.userId })
    .from(schema.userTrophies).where(sqlEq(schema.userTrophies.trophyId, trophyId));
  eq("exactly one trophy was awarded", held.length, 1);
  eq("…to the buyer", held[0].userId, buyer);

  const orders = await db.select({ recipientId: schema.marketplaceOrders.recipientId, kind: schema.marketplaceOrders.kind })
    .from(schema.marketplaceOrders).where(sqlEq(schema.marketplaceOrders.buyerId, buyer));
  eq("the order names the buyer as recipient", orders[0]?.recipientId, buyer);
  eq("…and is a self purchase", orders[0]?.kind, "self");

  // The other account must be untouched. Not "was not given this trophy" —
  // holds nothing at all, because the point is that no path exists.
  const theirs = await db.select({ id: schema.userTrophies.id })
    .from(schema.userTrophies).where(sqlEq(schema.userTrophies.userId, other));
  eq("nothing reached the other account", theirs.length, 0);
}

console.log("\n== the quest actions are retired, not merely unused ==");
for (const k of ["gift_sent", "gift_received"]) {
  const a = ACTION_CATALOG.find((x) => x.key === k);
  ok(`${k} still EXISTS in the catalogue`, !!a);
  eq(`…and pays nothing`, a?.defaultWeight, 0);
  ok(`…and says it is retired`, /retired/i.test(a?.label ?? ""));
}
// Kept rather than deleted on purpose: a quest whose stored `actionWeights`
// still names one reads zero instead of throwing, and an admin who had tuned
// them sees a 0 rather than a crash.
ok("no code path awards a gift action",
  !/awardQuestAction\([^)]*"gift_(sent|received)"/.test(code("lib/marketplace.ts")));

console.log("\n== every surface is gone, not just the server one ==");
{
  ok("the gift search module is deleted", !exists("lib/gift-search.ts"));
  ok("…and the gamer-search endpoint with it", !exists("app/api/gamers/search/route.ts"));
  ok("…and the Discord gift id helper", !exists("lib/discord/gift-id.ts"));

  const checkout = code("components/TrophyCheckout.tsx");
  ok("the checkout has no gift mode", !/"gift"/.test(checkout));
  ok("…and no recipient input", !/recipientSlug/.test(checkout));

  const screens = code("lib/discord/screens.ts");
  ok("the Discord card has no gift button", !/open-gift\|/.test(screens));
  ok("…and no gift modal", !/giftModal/.test(screens));

  const route = code("app/api/discord/interactions/route.ts");
  ok("the interaction router has no gift handler", !/giftSubmit|giftConfirm/.test(route));
}

console.log("\n== share_card finally fires ==");
// The reviewer caught that rebuilding a mission on `share_card` would recreate
// the defect B76 exists to fix: it has been priced and named in mission
// templates since B61 with NOTHING firing it. Built inside this item because
// this item is what needed it.
{
  const route = code("app/api/discord/interactions/route.ts");
  ok("something awards share_card", /awardQuestAction\([\s\S]{0,120}"share_card"/.test(route));
  ok("…after the card is posted, not on the button press",
    route.indexOf('"share_card"') > route.indexOf("if (asFollowUp)"));
  ok("…keyed on the day, so sharing five times pays once",
    /refType: "share"/.test(route));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
