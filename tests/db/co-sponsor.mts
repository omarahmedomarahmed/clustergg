// Two brands on one challenge, and never three. B101.
//
// THE ASSERTION THIS FILE EXISTS FOR is in the middle: a co-sponsored challenge
// is NOT paid until both brands have paid. Running it on one brand's money with
// the other's logo on it means the first funded the second's exposure, and the
// announce gate reads `bill.paid` — so getting this wrong does not produce a
// wrong number on a screen, it produces a promise to the whole network.
//
//   DEMO_DB=1 npx tsx tests/db/co-sponsor.mts

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

const code = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

const { getDb, schema } = await import("../../lib/db/index.ts");
const { uid } = await import("../../lib/utils.ts");
const { sponsorsOf, isCoSponsored, checkCoSponsor, splitBill, MAX_SPONSORS } =
  await import("../../lib/co-sponsor.ts");
const { billFor } = await import("../../lib/challenge-billing.ts");

const db = await getDb();
const tag = uid().slice(0, 8);

const mkBrand = async (name: string) => {
  const id = uid();
  await db.insert(schema.brands).values({ id, name: `${name} ${tag}` } as never);
  return id;
};

const mkChallenge = async (v: Record<string, unknown>) => {
  const [space] = await db.select().from(schema.spaces).limit(1);
  const id = uid();
  await db.insert(schema.challenges).values({
    id, spaceId: space.id, game: "Chess", provider: "chesscom",
    title: `Co ${tag}`, startAt: new Date(Date.now() + 86400_000),
    endAt: new Date(Date.now() + 8 * 86400_000), status: "draft", ...v,
  } as never);
  const [row] = await db.select().from(schema.challenges)
    .where((await import("drizzle-orm")).eq(schema.challenges.id, id)).limit(1);
  return row;
};

const invoiceFor = async (brandId: string, sourceId: string, amount: number, status: string) => {
  const invId = uid();
  await db.insert(schema.brandInvoices).values({
    id: invId, brandId, number: `INV-${uid().slice(0, 6)}`, status,
    currency: "USD", issuedAt: new Date(),
  } as never);
  await db.insert(schema.invoiceLines).values({
    id: uid(), invoiceId: invId, sourceType: "challenge", sourceId,
    kind: "challenge", label: "Co-sponsored challenge", quantity: 1, unitAmount: amount,
  } as never);
  return invId;
};

console.log("== the ceiling is two, and it is structural ==");
{
  eq("two brands, not more", MAX_SPONSORS, 2);
  eq("one brand reads as one", sponsorsOf({ sponsorBrandId: "a" }), ["a"]);
  eq("two read as two, lead first", sponsorsOf({ sponsorBrandId: "a", coSponsorBrandId: "b" }), ["a", "b"]);
  eq("the same brand twice is one", sponsorsOf({ sponsorBrandId: "a", coSponsorBrandId: "a" }), ["a"]);
  eq("nothing is nothing", sponsorsOf({}), []);
  ok("…and one brand is not a collaboration", !isCoSponsored({ sponsorBrandId: "a" }));
  ok("…while two is", isCoSponsored({ sponsorBrandId: "a", coSponsorBrandId: "b" }));

  // A third brand cannot be STORED, which is stronger than refusing to write
  // one: the schema has two columns, so the invalid state has no shape.
  const schemaSrc = code("lib/db/schema.ts");
  ok("there is no array of sponsors to overfill",
    !/sponsor_brand_ids|sponsorBrandIds/.test(schemaSrc));
  ok("…just a second column", /co_sponsor_brand_id/.test(schemaSrc));
}

console.log("\n== the pick is refused for reasons a person can read ==");
{
  ok("clearing it is always allowed", checkCoSponsor("a", "").ok);
  ok("…and so is clearing it with no lead at all", checkCoSponsor(null, "").ok);
  const noLead = checkCoSponsor(null, "b");
  ok("a co-sponsor with no lead is refused", !noLead.ok);
  ok("…and says to pick the lead first",
    /lead brand first/i.test((noLead as { error: string }).error));
  const same = checkCoSponsor("a", "a");
  ok("the same brand twice is refused", !same.ok);
  ok("…and says why", /two different brands/i.test((same as { error: string }).error));
  const good = checkCoSponsor("a", "b");
  ok("a second brand is accepted", good.ok && good.coSponsorBrandId === "b");
}

console.log("\n== the split always adds back to the total ==");
{
  eq("50/50 by default", splitBill(1000), { lead: 500, co: 500 });
  eq("…and a real deal is a number, not a special case", splitBill(1000, 70), { lead: 700, co: 300 });
  // The one that matters. Splitting an odd amount evenly and rounding both
  // halves loses a cent, and a cent missing from an invoice is a support
  // ticket from somebody's finance department.
  const odd = splitBill(250.01);
  eq("an odd amount still adds back", Math.round((odd.lead + odd.co) * 100) / 100, 250.01);
  const weird = splitBill(333.33, 33);
  eq("…whatever the percentage", Math.round((weird.lead + weird.co) * 100) / 100, 333.33);
  eq("100% to the lead leaves nothing to bill", splitBill(500, 100), { lead: 500, co: 0 });
}

console.log("\n== ONE brand paying is NOT paid ==");
{
  const lead = await mkBrand("Lead");
  const co = await mkBrand("Co");
  const ch = await mkChallenge({
    sponsorBrandId: lead, coSponsorBrandId: co, leadSharePct: 50, sponsorPrice: 500,
  });

  // Neither has paid.
  let bill = await billFor(db, ch);
  ok("with no invoices it is not paid", !bill.paid);
  ok("…and both brands are named", !!bill.payer && !!bill.coPayer,
    JSON.stringify([bill.payer?.name, bill.coPayer?.name]));

  // The lead pays. The co-sponsor has not.
  await invoiceFor(lead, ch.id, 250, "paid");
  bill = await billFor(db, ch);
  ok("one paid invoice is still NOT paid", !bill.paid, JSON.stringify(bill.evidence));
  ok("…and the warning names who has not", /Co /.test(bill.warning), bill.warning);
  ok("…and says why it must not announce",
    /must not be announced|one brand should never fund/i.test(bill.warning), bill.warning);

  // Now the co-sponsor pays.
  await invoiceFor(co, ch.id, 250, "paid");
  bill = await billFor(db, ch);
  ok("both paid means paid", bill.paid, bill.warning);
  ok("…and the warning is gone", bill.warning === "", bill.warning);
  eq("…and each owes their share", bill.split, { lead: 250, co: 250 });
}

console.log("\n== a single-brand challenge is untouched ==");
{
  const solo = await mkBrand("Solo");
  const ch = await mkChallenge({ sponsorBrandId: solo, sponsorPrice: 300 });
  let bill = await billFor(db, ch);
  ok("unpaid is unpaid", !bill.paid);
  eq("there is no second payer", bill.coPayer, null);
  eq("…and no split to show", bill.split, null);

  await invoiceFor(solo, ch.id, 300, "paid");
  bill = await billFor(db, ch);
  ok("one paid invoice is enough when there is one brand", bill.paid, bill.warning);
}

console.log("\n== the announce gate reads the same bill ==");
{
  // Proven from source: running this needs a Discord webhook and a card. What
  // matters is that the gate has no second opinion about payment — a
  // co-sponsored challenge that announces on one brand's money is the failure
  // this whole file is about, and it would happen here.
  const announce = code("lib/discord/announce.ts");
  ok("it refuses an unpaid challenge", /!bill\.paid.*not_paid/s.test(announce));
  ok("…and does not compute paid-ness itself",
    !/status === "paid"/.test(announce));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
