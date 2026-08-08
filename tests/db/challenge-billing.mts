/**
 * B91.2 — who paid for this challenge, and have they.
 *
 * The cost of not knowing is specific: a challenge goes live, pays out prize
 * money from the prize vault — which is other brands' money — and nobody
 * notices for a month that the invoice behind it was never paid.
 *
 * The assertion that matters is the CAMPAIGN one. A campaign is billed once
 * for all of its weeks, so week 3 has no invoice line of its own; reading that
 * as unpaid would put a false warning on three quarters of every campaign, and
 * a warning that is usually wrong is one nobody reads.
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
const { kindOf, billFor, KINDS } = await import("../../lib/challenge-billing.ts");

const db = await getDb();
const tag = uid().slice(0, 6);

console.log("== the four kinds ==");
{
  eq("a welcome challenge is HOUSE, whatever else is true of it",
    kindOf({ kind: "welcome", visibility: "private", guildId: "g1", sponsorBrandId: "b1" }), "house");
  eq("a campaign slot is CAMPAIGN", kindOf({ sponsorBrandId: "b1", sponsorCampaignId: "c1" }), "campaign");
  eq("a brand with no campaign is CUSTOM", kindOf({ sponsorBrandId: "b1" }), "custom");
  eq("a server's own is PRIVATE", kindOf({ visibility: "private", guildId: "g1" }), "private");
  eq("nothing at all is HOUSE", kindOf({}), "house");
  ok("every kind explains itself",
    Object.values(KINDS).every((k) => k.blurb.length > 30));
}

const brandId = uid();
await db.insert(schema.brands).values({
  id: brandId, name: `Bill Co ${tag}`, slug: `bill-co-${tag.toLowerCase()}`, status: "active",
});
const [space] = await db.select({ id: schema.spaces.id }).from(schema.spaces).limit(1);

const mkChallenge = async (patch: Record<string, unknown>) => {
  const id = uid();
  await db.insert(schema.challenges).values({
    id, spaceId: space?.id, title: `Bill ${tag}`, game: "Chess.com", provider: "chesscom",
    format: "leaderboard", status: "draft",
    startAt: new Date(), endAt: new Date(Date.now() + 7 * 86400_000),
    ...patch,
  } as never);
  return id;
};

const mkInvoice = async (status: string, lines: { sourceType: string; sourceId: string; amount: number }[]) => {
  const id = uid();
  await db.insert(schema.brandInvoices).values({
    id, brandId, number: `TST-${uid().slice(0, 5)}`, status,
    periodLabel: "test", issuedAt: new Date(),
  } as never);
  for (const l of lines) {
    await db.insert(schema.invoiceLines).values({
      id: uid(), invoiceId: id, kind: "challenge", label: "A challenge",
      quantity: 1, unitAmount: l.amount, sourceType: l.sourceType, sourceId: l.sourceId,
    } as never);
  }
  return id;
};

console.log("\n== a campaign is billed once, for all of its weeks ==");
{
  const campaignId = uid();
  const week1 = await mkChallenge({ sponsorBrandId: brandId, sponsorCampaignId: campaignId });
  const week3 = await mkChallenge({ sponsorBrandId: brandId, sponsorCampaignId: campaignId });
  await mkInvoice("paid", [{ sourceType: "campaign", sourceId: campaignId, amount: 1000 }]);

  const b1 = await billFor(db, { id: week1, sponsorBrandId: brandId, sponsorCampaignId: campaignId });
  ok("week one is paid", b1.paid, JSON.stringify(b1));
  eq("…and it names the brand", b1.payer?.name, `Bill Co ${tag}`);
  ok("…and the evidence is an invoice number", /Invoice /.test(b1.evidence ?? ""), String(b1.evidence));

  // The one that would have gone wrong: week 3 has no line of its own.
  const b3 = await billFor(db, { id: week3, sponsorBrandId: brandId, sponsorCampaignId: campaignId });
  ok("week three is covered by the same bill", b3.paid, JSON.stringify(b3));
  eq("…and says nothing is wrong", b3.warning, "");
}

console.log("\n== an unpaid one says so, and says which invoice ==");
{
  const campaignId = uid();
  const ch = await mkChallenge({ sponsorBrandId: brandId, sponsorCampaignId: campaignId });
  const invId = await mkInvoice("overdue", [{ sourceType: "campaign", sourceId: campaignId, amount: 1000 }]);
  const b = await billFor(db, { id: ch, sponsorBrandId: brandId, sponsorCampaignId: campaignId });
  ok("it is not paid", !b.paid);
  ok("…and the warning names the invoice", /Invoiced and not paid/.test(b.warning), b.warning);
  ok("…and links to it", (b.href ?? "").includes(invId), String(b.href));
}

console.log("\n== a challenge nobody is billed for is the loudest case ==");
{
  // Live, paying prize money out of the prize vault, and no brand attached.
  // That money is other brands'.
  const ch = await mkChallenge({});
  const b = await billFor(db, { id: ch });
  eq("it reads as house", b.kind, "house");
  eq("…and a house challenge is not flagged, because it is ours", b.warning, "");

  const orphan = await mkChallenge({ sponsorCampaignId: uid() });
  const b2 = await billFor(db, { id: orphan, sponsorCampaignId: "missing" });
  ok("but a sponsored one with no brand IS flagged",
    /nobody is being billed/.test(b2.warning), b2.warning);
}

console.log("\n== a private challenge is paid from a wallet, not an invoice ==");
{
  const guildId = `bill-${tag}`;
  await db.insert(schema.discordGuilds).values({
    guildId, name: `Bill Guild ${tag}`, memberCount: 10,
  }).onConflictDoNothing();

  const ch = await mkChallenge({ visibility: "private", guildId });
  const unpaid = await billFor(db, { id: ch, visibility: "private", guildId });
  eq("…and it is private", unpaid.kind, "private");
  ok("with nothing charged, it says so", !unpaid.paid && /Nothing has been charged/.test(unpaid.warning), unpaid.warning);
  eq("…and it names the server, not a brand", unpaid.payer?.type, "server");

  await db.insert(schema.serverCharges).values({
    id: uid(), guildId, amount: 200, feeAmount: 10,
    label: "Private challenge", challengeId: ch,
  } as never);
  const paid = await billFor(db, { id: ch, visibility: "private", guildId });
  ok("once charged, it is paid", paid.paid);
  // The fee is part of what they paid. Showing only the prize pool understates
  // what the owner was actually charged, which is the number they will check.
  eq("…and the amount includes our margin", paid.amount, 210);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
