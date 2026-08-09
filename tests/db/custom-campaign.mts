/**
 * B91.5 — a brand's money always belongs to a campaign.
 *
 * The campaign is the only object that answers "what did this brand buy": the
 * invoice lines point at it, `billFor` rolls a whole series up under it, and
 * the brand's portal lists it. A sponsored challenge with no campaign is money
 * that arrived attached to nothing — no report, no renewal conversation, and a
 * portal telling the brand they bought nothing.
 */
process.env.DEMO_DB = "1";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { readFileSync } = await import("node:fs");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { uid } = await import("../../lib/utils.ts");
const { ensureCampaignFor, attachSeriesToCampaign } = await import("../../lib/custom-campaign.ts");
const { billFor } = await import("../../lib/challenge-billing.ts");
const { eq: dEq } = await import("drizzle-orm");

const db = await getDb();
const tag = uid().slice(0, 6).toLowerCase();
const brandId = uid();
await db.insert(schema.brands).values({
  id: brandId, name: `Deal Co ${tag}`, slug: `deal-co-${tag}`, status: "active",
});
const [space] = await db.select({ id: schema.spaces.id }).from(schema.spaces).limit(1);
const start = new Date("2026-10-05T00:00:00Z");

console.log("== a bespoke deal gets a campaign built from what was typed ==");
{
  const id = await ensureCampaignFor(db, {
    brandId, game: "Chess.com", startAt: start, cadence: "weekly", runs: 8, pricePerChallenge: 300,
  });
  ok("a campaign was created", !!id, String(id));

  const [c] = await db.select().from(schema.sponsoredCampaigns).where(dEq(schema.sponsoredCampaigns.id, id!));
  eq("…for eight weeks", c.slots, 8);
  eq("…priced per challenge", c.pricePerChallenge, 300);
  eq("…and totalled", c.total, 2400);
  // DRAFT, not submitted. An admin typing in a deal has not been paid for it,
  // and a campaign that reads "running" before the invoice clears is the exact
  // claim the status ladder exists to prevent.
  eq("…as a DRAFT, because nobody has paid yet", c.status, "draft");
  eq("…starting when the challenge does", c.startAt.toISOString(), start.toISOString());
  eq("…with a slot per run", (c.slotState ?? []).length, 8);
  ok("…each slot dated", (c.slotState ?? []).every((s) => !!s.startAt && !!s.endAt));
}

console.log("== an existing campaign is reused, not duplicated ==");
{
  const first = await ensureCampaignFor(db, {
    brandId, game: "Chess.com", startAt: start, cadence: "weekly", runs: 4, pricePerChallenge: 250,
  });
  const again = await ensureCampaignFor(db, {
    brandId, campaignId: first, game: "Chess.com", startAt: start, cadence: "weekly", runs: 4, pricePerChallenge: 250,
  });
  eq("the same campaign comes back", again, first);

  // A stale id from a re-submitted form must not attach the challenge to a
  // campaign that no longer exists — the bill would roll up to nothing.
  const bogus = await ensureCampaignFor(db, {
    brandId, campaignId: "does-not-exist", game: "Chess.com", startAt: start,
    cadence: "weekly", runs: 1, pricePerChallenge: 250,
  });
  ok("a dead id is replaced rather than trusted", !!bogus && bogus !== "does-not-exist", String(bogus));
}

console.log("\n== no brand, no campaign ==");
{
  // A house challenge belongs to nothing, and minting an empty campaign for it
  // would put a customer that does not exist into every campaign list.
  const none = await ensureCampaignFor(db, {
    brandId: "", game: "Chess.com", startAt: start, cadence: "weekly", runs: 4, pricePerChallenge: 0,
  });
  eq("nothing is created", none, null);
}

console.log("\n== attaching covers the whole series, not the run being edited ==");
{
  const seriesId = uid();
  for (let i = 1; i <= 4; i++) {
    await db.insert(schema.challenges).values({
      id: i === 1 ? seriesId : uid(), spaceId: space?.id,
      title: `Deal ${tag} — Week ${i}`, baseTitle: `Deal ${tag}`,
      game: "Chess.com", provider: "chesscom", format: "leaderboard", status: "draft",
      startAt: new Date(start.getTime() + (i - 1) * 7 * 86400_000),
      endAt: new Date(start.getTime() + i * 7 * 86400_000),
      cadence: "weekly", seriesId, runIndex: i, runsPlanned: 4,
    } as never);
  }

  const campaignId = await ensureCampaignFor(db, {
    brandId, game: "Chess.com", startAt: start, cadence: "weekly", runs: 4, pricePerChallenge: 250,
  });
  const n = await attachSeriesToCampaign(db, seriesId, campaignId!, brandId);
  // A brand bought eight weeks, not week one. Attaching only the edited run
  // leaves seven weeks billing to nothing and a report that says the deal was
  // an eighth of its size.
  eq("all four runs were attached", n, 4);

  const runs = await db.select({ campaignId: schema.challenges.sponsorCampaignId, brand: schema.challenges.sponsorBrandId })
    .from(schema.challenges).where(dEq(schema.challenges.seriesId, seriesId));
  ok("…every one of them to the same campaign",
    runs.every((r) => r.campaignId === campaignId && r.brand === brandId),
    JSON.stringify(runs));

  // And the bill now rolls up: an invoice against the campaign covers week 4.
  const invId = uid();
  await db.insert(schema.brandInvoices).values({
    id: invId, brandId, number: `DEAL-${tag}`, status: "paid", periodLabel: "test", issuedAt: new Date(),
  } as never);
  await db.insert(schema.invoiceLines).values({
    id: uid(), invoiceId: invId, kind: "challenge", label: "8 weeks",
    quantity: 1, unitAmount: 2000, sourceType: "campaign", sourceId: campaignId!,
  } as never);

  const last = await db.select({ id: schema.challenges.id }).from(schema.challenges)
    .where(dEq(schema.challenges.seriesId, seriesId));
  const bill = await billFor(db, {
    id: last[3].id, sponsorBrandId: brandId, sponsorCampaignId: campaignId,
  });
  ok("the last week of the series reads as paid", bill.paid, JSON.stringify(bill));
}

console.log("\n== the builder no longer offers 'no campaign' ==");
{
  // The option existed and said "(optional)". Leaving it in means the rule
  // above is enforced everywhere except the one screen people use.
  const src = readFileSync("components/ChallengeBuilder.tsx", "utf8");
  ok("there is no unattached option", !/— not tied to a campaign —/.test(src));
  ok("…and the screen says what happens instead",
    /A draft campaign will be created/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
