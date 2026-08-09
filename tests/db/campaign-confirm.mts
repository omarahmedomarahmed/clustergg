/**
 * B91.10 — sales builds it, the brand confirms it.
 *
 * A sales conversation used to end with somebody typing the deal into the admin
 * console, and the next thing the brand saw was an invoice for something they
 * had never seen a screen for.
 *
 * The assertion that matters is the OWNERSHIP one: confirming somebody else's
 * campaign would commit them to a bill they never agreed to, so the check is
 * against the brand whose portal is open, never against an id in a form.
 */
process.env.DEMO_DB = "1";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { getDb, schema } = await import("../../lib/db/index.ts");
const { uid } = await import("../../lib/utils.ts");
const { ensureCampaignFor } = await import("../../lib/custom-campaign.ts");
const { portalConfirmCampaign } = await import("../../app/actions/brand-portal.ts");
const { openAlerts } = await import("../../lib/staff-alerts.ts");
const { eq: dEq } = await import("drizzle-orm");

const db = await getDb();
const tag = uid().slice(0, 6).toLowerCase();

const mkBrand = async (name: string) => {
  const id = uid();
  const key = `KEY-${uid().slice(0, 8).toUpperCase()}`;
  await db.insert(schema.brands).values({
    id, name: `${name} ${tag}`, slug: `${name}-${tag}`, accessKey: key, status: "active",
  });
  return { id, key };
};

const ours = await mkBrand("confirmco");
const rival = await mkBrand("rivalco");

const campaignId = (await ensureCampaignFor(db, {
  brandId: ours.id, game: "Chess.com", startAt: new Date(Date.now() + 7 * 86400_000),
  cadence: "weekly", runs: 4, pricePerChallenge: 300,
}))!;

console.log("== a campaign sales built is a DRAFT until the brand says yes ==");
{
  const [c] = await db.select({ status: schema.sponsoredCampaigns.status })
    .from(schema.sponsoredCampaigns).where(dEq(schema.sponsoredCampaigns.id, campaignId));
  eq("it starts as a draft", c.status, "draft");
}

console.log("\n== another brand cannot confirm it ==");
{
  // Confirming somebody else's campaign commits them to a bill they never
  // agreed to. The check is against the brand whose PORTAL is open, never
  // against an id posted in a form.
  const res = await portalConfirmCampaign(rival.id, rival.key, campaignId);
  ok("it is refused", !!res.error, JSON.stringify(res));
  ok("…and says whose it is not", /not yours/i.test(res.error ?? ""), res.error);

  const [c] = await db.select({ status: schema.sponsoredCampaigns.status })
    .from(schema.sponsoredCampaigns).where(dEq(schema.sponsoredCampaigns.id, campaignId));
  eq("…and nothing moved", c.status, "draft");
}

console.log("\n== a wrong key is a wrong key ==");
{
  let threw = false;
  try { await portalConfirmCampaign(ours.id, "NOT-THE-KEY", campaignId); }
  catch { threw = true; }
  ok("the portal guard rejects it", threw);
}

console.log("\n== the brand confirms ==");
{
  const res = await portalConfirmCampaign(ours.id, ours.key, campaignId);
  ok("it worked", !!res.ok, JSON.stringify(res));
  // The order has to be said out loud: a brand that thinks confirming put them
  // live will ask us why nothing is running.
  ok("…and the message says the invoice comes next",
    /invoice/i.test(res.message ?? ""), res.message);
  ok("…and that nothing runs until it is paid",
    /until it's paid|until it is paid|nothing runs/i.test(res.message ?? ""), res.message);

  const [c] = await db.select({ status: schema.sponsoredCampaigns.status })
    .from(schema.sponsoredCampaigns).where(dEq(schema.sponsoredCampaigns.id, campaignId));
  eq("the campaign is submitted", c.status, "submitted");

  // The strongest signal we get: a deal stopped being a conversation.
  const alerts = await openAlerts(db, "sales", 200);
  const mine = alerts.find((a) => a.refId === campaignId && a.kind === "brand.campaign_confirmed");
  ok("sales was told", !!mine, JSON.stringify(alerts.slice(0, 2).map((a) => a.kind)));
  ok("…with what it is worth", /\$/.test(mine?.body ?? ""), mine?.body);
  ok("…and that they are waiting on us", /invoice/i.test(mine?.body ?? ""), mine?.body);
}

console.log("\n== confirming twice is not a second booking ==");
{
  const again = await portalConfirmCampaign(ours.id, ours.key, campaignId);
  ok("it is not an error", !!again.ok, JSON.stringify(again));
  ok("…and it says it is already done", /already confirmed/i.test(again.message ?? ""), again.message);

  const alerts = (await openAlerts(db, "sales", 200))
    .filter((a) => a.refId === campaignId && a.kind === "brand.campaign_confirmed");
  eq("…and sales is not told twice", alerts.length, 1);
}

console.log("\n== confirming does not put anything on the network ==");
{
  // The whole safety of this button. Announcing checks the BILL, and the bill
  // is not paid — so the servers hear nothing until it is.
  const { billFor } = await import("../../lib/challenge-billing.ts");
  const bill = await billFor(db, { id: uid(), sponsorBrandId: ours.id, sponsorCampaignId: campaignId });
  ok("the campaign is still unpaid", !bill.paid, JSON.stringify(bill));
  ok("…and the challenge screen says so", /no invoice covers this|not paid/i.test(bill.warning), bill.warning);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
