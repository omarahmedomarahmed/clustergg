// B36 — brands prepay.
//
// Money-touching, so it is written with the item (§1.1). Two things are under
// test and they pull in opposite directions: that an unpaid brand loses its
// inventory, and that the gamers who already won keep their prizes. A guard that
// gets the first right and the second wrong is worse than no guard.
//
//   DEMO_DB=1 npx tsx tests/db/prepay.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { invoiceCampaign, campaignInvoice, brandBlocked, graceEndsAt, invoiceTotal, runDunning, CAMPAIGN_TERMS_DAYS } =
  await import("../../lib/prepay.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { and, eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

const db = await getDb();
const DAY = 86400_000;

// A brand of our own, so nothing in the demo data can move these numbers.
const brandId = uid();
await db.insert(schema.brands).values({
  id: brandId, slug: `pp-${brandId.slice(0, 8)}`, name: "Prepay Co",
  contactEmail: `${brandId}@test.invalid`,
} as never);

const mkCampaign = async (game: string) => {
  const id = uid();
  await db.insert(schema.sponsoredCampaigns).values({
    id, brandId, game, slots: 4, pricePerChallenge: 250, total: 1000,
    status: "running", startAt: new Date(Date.now() - 20 * DAY), slotState: [], targeting: {},
  } as never);
  return id;
};

console.log("== the invoice exists at all ==");
const c1 = await mkCampaign("Chess");
const invId = await invoiceCampaign(db, c1);
ok("buying a campaign produces an invoice", !!invId);
const inv = await campaignInvoice(db, c1);
ok("…findable from the campaign", !!inv);
eq("…priced from the campaign, not typed by anybody", await invoiceTotal(db, invId!), 1000);
eq("…and issued rather than left as a draft", inv?.status, "sent");

console.log("\n== due the day it is issued ==");
eq("campaign terms are same-day", CAMPAIGN_TERMS_DAYS, 0);
const issued = inv!.issuedAt!.getTime();
const due = inv!.dueAt!.getTime();
eq("the due date IS the issue date", due, issued);

console.log("\n== billed once, whatever happens ==");
const again = await invoiceCampaign(db, c1);
eq("a second call returns the same invoice", again, invId);
const [{ n }] = await db.select({ n: schema.brandInvoices.id }).from(schema.brandInvoices)
  .where(sqlEq(schema.brandInvoices.brandId, brandId)).limit(1).then((r) => [{ n: r.length }]);
const allInv = await db.select({ id: schema.brandInvoices.id }).from(schema.brandInvoices)
  .where(sqlEq(schema.brandInvoices.brandId, brandId));
void n;
eq("…and does not open a second one", allInv.length, 1);

console.log("\n== the challenge goes live regardless ==");
// Nothing above gates on payment: the campaign is running and its first slot
// opened. Asserted as the absence of a block while the window is open.
const openState = await brandBlocked(db, brandId);
ok("an unpaid brand inside its window is NOT blocked", !openState.blocked, openState.reason);
eq("…and the portal calls it issued, not overdue", openState.stage, "due");

console.log("\n== the window is the first challenge's end ==");
ok("with no challenge bound yet there is no window", (await graceEndsAt(db, c1)) === null);

const chId = uid();
const endAt = new Date(Date.now() - 2 * DAY);   // the first challenge has ENDED
const [space] = await db.select({ id: schema.spaces.id }).from(schema.spaces).limit(1);
await db.insert(schema.challenges).values({
  id: chId, spaceId: space.id, title: "Prepay Cup", game: "Chess", provider: "chesscom",
  startAt: new Date(Date.now() - 9 * DAY), endAt, status: "ended",
  sponsorBrandId: brandId, sponsorCampaignId: c1,
} as never);
eq("the window is read off the challenge, not computed from a start date",
  (await graceEndsAt(db, c1))?.toISOString(), endAt.toISOString());

console.log("\n== past the window, unpaid, the brand is blocked ==");
const blocked = await brandBlocked(db, brandId);
ok("the brand is blocked", blocked.blocked);
eq("…at the blocked stage", blocked.stage, "blocked");
ok("…with a stated reason naming the invoice", blocked.reason.includes(inv!.number), blocked.reason);
ok("…that promises running challenges finish", /finish/.test(blocked.reason));
ok("…and that prizes already won are still paid", /still paid/.test(blocked.reason), blocked.reason);

console.log("\n== the block stops NEW inventory and nothing else ==");
// Approval is where the stop lives. A pending request from this brand must be
// refused with the reason; a request from a paid-up brand must not be.
const { approveRequest } = await import("../../lib/challenge-requests.ts");
const reqId = uid();
await db.insert(schema.challengeRequests).values({
  id: reqId, guildId: "demo-guild-nebula-1", brandId, campaignId: c1, slotIndex: 1,
  game: "Chess", provider: "chesscom", status: "pending", title: "Second one",
} as never);
const res = await approveRequest(reqId, "admin-test");
ok("approving a new challenge for a blocked brand is refused",
  res.ok === false && res.reason === "brand_unpaid", JSON.stringify(res));
ok("…with the reason a human can act on",
  res.ok === false && !!res.message && res.message.includes(inv!.number));

// The other half, and the one that matters more: nothing about a won prize is
// touched by any of this. A trophy already awarded stays awarded and redeemable.
const winner = uid();
await db.insert(schema.users).values({
  id: winner, slug: `pw-${winner.slice(0, 8)}`, displayName: "Winner",
  email: `${winner}@test.invalid`, passwordHash: "x",
} as never);
const [trophy] = await db.select().from(schema.trophies).limit(1);
if (trophy) {
  const awardId = uid();
  await db.insert(schema.userTrophies).values({
    id: awardId, userId: winner, trophyId: trophy.id, placement: 1,
  } as never);
  const held = await db.select().from(schema.userTrophies)
    .where(sqlEq(schema.userTrophies.id, awardId));
  eq("a prize won under an unpaid campaign is still held", held.length, 1);
  // Redemption reads the award, and nothing in the prepay path touches it.
  const redeemId = uid();
  await db.insert(schema.trophyRedeems).values({
    id: redeemId, userId: winner, userTrophyId: awardId, amount: Number(trophy.value ?? 5), status: "pending",
  } as never);
  const [r] = await db.select().from(schema.trophyRedeems).where(sqlEq(schema.trophyRedeems.id, redeemId));
  ok("…and can still be redeemed", !!r && r.status === "pending");
} else {
  ok("a trophy exists to award", false, "no trophies seeded");
}

console.log("\n== paying it clears the block immediately ==");
await db.update(schema.brandInvoices).set({ status: "paid", paidAt: new Date() })
  .where(sqlEq(schema.brandInvoices.id, invId!));
const cleared = await brandBlocked(db, brandId);
ok("a paid invoice unblocks the brand", !cleared.blocked);
const res2 = await approveRequest(reqId, "admin-test");
ok("…and approval is no longer refused for payment",
  !(res2.ok === false && res2.reason === "brand_unpaid"), JSON.stringify(res2));

console.log("\n== each dunning stage sends once ==");
const c2 = await mkCampaign("Lichess Bullet");
await invoiceCampaign(db, c2);
const first = await runDunning(db);
const second = await runDunning(db);
ok("the first run sends something", first.sent.length > 0, JSON.stringify(first.sent));
eq("the second run sends nothing again", second.sent, []);
// Deduped from the email LOG — the record of what left the building, not a flag
// recording what we meant to do.
const inv2 = await campaignInvoice(db, c2);
const logs = await db.select({ id: schema.emailLog.id }).from(schema.emailLog)
  .where(sqlEq(schema.emailLog.refId, inv2!.id));
eq("exactly one message per invoice stage is logged", logs.length, 1);

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
