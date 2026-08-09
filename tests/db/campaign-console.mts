// Which weeks did somebody pay for that are not going to happen? B102.
//
// That is the question this console exists to answer, and every assertion here
// is about the ORDER it answers it in. A campaign with a week that opened empty
// must be above one whose week opens on Friday, which must be above one that is
// merely unpaid — because the first is a refund conversation, the second is an
// afternoon's work, and the third is an email.
//
//   DEMO_DB=1 npx tsx tests/db/campaign-console.mts

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
const { campaignConsole, AT_RISK_DAYS } = await import("../../lib/campaign-console.ts");

const db = await getDb();
const tag = uid().slice(0, 8);
const DAY = 86400_000;

const mkBrand = async (name: string) => {
  const id = uid();
  await db.insert(schema.brands).values({ id, name: `${name} ${tag}` } as never);
  return id;
};

const slot = (index: number, daysFromNow: number, opts: { challengeId?: string; status?: string } = {}) => ({
  index,
  startAt: new Date(Date.now() + daysFromNow * DAY).toISOString(),
  endAt: new Date(Date.now() + (daysFromNow + 7) * DAY).toISOString(),
  game: "Chess",
  challengeId: opts.challengeId ?? null,
  status: opts.status ?? (opts.challengeId ? "live" : "waiting"),
});

const mkCampaign = async (brandId: string, slots: unknown[], v: Record<string, unknown> = {}) => {
  const id = uid();
  await db.insert(schema.sponsoredCampaigns).values({
    id, brandId, game: "Chess", slots: slots.length,
    pricePerChallenge: 250, total: 250 * slots.length,
    status: "running", startAt: new Date(Date.now() - 7 * DAY),
    slotState: slots, ...v,
  } as never);
  return id;
};

const invoice = async (brandId: string, campaignId: string, amount: number, status: string) => {
  const invId = uid();
  await db.insert(schema.brandInvoices).values({
    id: invId, brandId, number: `INV-${uid().slice(0, 6)}`, status,
    currency: "USD", issuedAt: new Date(),
  } as never);
  await db.insert(schema.invoiceLines).values({
    id: uid(), invoiceId: invId, sourceType: "campaign", sourceId: campaignId,
    kind: "challenge", label: "Campaign", quantity: 1, unitAmount: amount,
  } as never);
};

console.log("== a healthy campaign says nothing ==");
let healthyId = "";
{
  const brand = await mkBrand("Healthy");
  healthyId = await mkCampaign(brand, [
    slot(0, -7, { challengeId: uid(), status: "done" }),
    slot(1, 14),
  ]);
  await invoice(brand, healthyId, 500, "paid");

  const rows = await campaignConsole(db);
  const mine = rows.find((c) => c.id === healthyId);
  ok("it is listed", !!mine);
  eq("…with no warning", mine?.warning, "");
  eq("…and no risk", mine?.risk, 0);
  eq("…and the money reads back", [mine?.invoiced, mine?.paid], [500, 500]);
  // A slot two weeks out with nothing in it is not a problem yet. Calling it
  // one would fill the console with rows nobody needs to act on, which is how
  // an operator learns to skip the whole page.
  ok("a slot far in the future is not at risk", !mine?.slots.some((s) => s.atRisk));
}

console.log("\n== a week that opens soon with nothing built is flagged ==");
let soonId = "";
{
  const brand = await mkBrand("Soon");
  soonId = await mkCampaign(brand, [slot(0, 1)]);
  await invoice(brand, soonId, 250, "paid");

  const mine = (await campaignConsole(db)).find((c) => c.id === soonId);
  ok("the slot is at risk", !!mine?.slots[0].atRisk);
  ok("…and the warning says how soon", mine?.warning.includes(String(AT_RISK_DAYS)), mine?.warning);
  ok("…and it outranks a healthy campaign", (mine?.risk ?? 0) > 0);
}

console.log("\n== a week that ALREADY opened empty is worse ==");
let missedId = "";
{
  const brand = await mkBrand("Missed");
  missedId = await mkCampaign(brand, [slot(0, -2)]);
  await invoice(brand, missedId, 250, "paid");

  const rows = await campaignConsole(db);
  const mine = rows.find((c) => c.id === missedId);
  ok("it is warned about", !!mine?.warning, mine?.warning);
  ok("…in the language of a refund, not a backlog",
    /refund/i.test(mine?.warning ?? ""), mine?.warning);

  // THE ASSERTION THIS FILE EXISTS FOR. A week already lost must sort above a
  // week that can still be saved, or the console reads as a to-do list with
  // the emergency in the middle of it.
  const soon = rows.find((c) => c.id === soonId);
  ok("a missed week outranks a week at risk", (mine?.risk ?? 0) > (soon?.risk ?? 0),
    `${mine?.risk} vs ${soon?.risk}`);
  ok("…and both outrank a healthy one",
    (soon?.risk ?? 0) > (rows.find((c) => c.id === healthyId)?.risk ?? -1));

  // A past slot is NOT also counted as "at risk" — it would hide among the
  // ones that are still fixable.
  ok("a past week is not called at-risk", !mine?.slots[0].atRisk);
}

console.log("\n== money problems are said, and rank below missing weeks ==");
{
  const brand = await mkBrand("Unpaid");
  const id = await mkCampaign(brand, [slot(0, 21, { challengeId: uid() })]);
  await invoice(brand, id, 250, "sent");

  const rows = await campaignConsole(db);
  const mine = rows.find((c) => c.id === id);
  ok("an unpaid running campaign is flagged", !!mine?.warning, mine?.warning);
  ok("…with the amount", /250/.test(mine?.warning ?? ""), mine?.warning);
  eq("…and paid is zero", mine?.paid, 0);
  ok("…but it ranks below a missed week",
    (mine?.risk ?? 0) < (rows.find((c) => c.id === missedId)?.risk ?? 0));

  const noBill = await mkCampaign(await mkBrand("Uninvoiced"), [slot(0, 21, { challengeId: uid() })]);
  const nb = (await campaignConsole(db)).find((c) => c.id === noBill);
  ok("a campaign nobody was invoiced for is flagged",
    /nobody's money/i.test(nb?.warning ?? ""), nb?.warning);
}

console.log("\n== the console is worst-first, and reads nothing of its own ==");
{
  const rows = await campaignConsole(db);
  ok("it is sorted by risk", rows.every((c, i) => i === 0 || rows[i - 1].risk >= c.risk),
    JSON.stringify(rows.map((c) => c.risk)));

  const src = code("lib/campaign-console.ts");
  // The games come from the shared derivation. A console with its own idea of
  // which games a campaign is on disagrees with the brand's own portal, and C7
  // made that a real possibility — a campaign can be mixed.
  ok("games come from the shared derivation", /campaignGames\(/.test(src));
  ok("…and it writes nothing at all",
    !/db\.insert|db\.update|db\.delete/.test(src));

  // One query for the whole page. A console is the screen most likely to be
  // left open on a second monitor, and N+1 on twenty campaigns is eighty
  // round trips a minute.
  const selects = (src.match(/db\.select\(/g) ?? []).length;
  ok("it does not query per campaign", selects <= 3, `${selects} selects`);

  const page = code("app/admin/campaigns/page.tsx");
  ok("the page says so when nothing needs doing", /Nothing needs you here/.test(page));
  ok("…and every slot links to the challenge behind it",
    /admin\/challenges\/\$\{s\.challengeId\}/.test(page));
  ok("…and it is in the admin nav", /admin\/campaigns/.test(code("lib/admin-nav.ts")));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
