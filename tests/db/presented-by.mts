// Two brands, one line, four surfaces. B107.
//
// THE GAP: B101 gave a challenge a second sponsor — a column, a validator, a
// 50/50 split, and a billing rule that refuses to announce until BOTH brands
// have paid. It gave them nowhere a gamer reads two names.
//
// That is the wrong half to have built. A brand buys their name in front of the
// people playing; the invoice is how they pay for it. We had the invoice
// working perfectly and the thing it bought did not exist — a co-sponsored
// challenge looked, to every person who saw it, exactly like a challenge with
// one sponsor.
//
// The one place a brand name reached a gamer at all was the weekly Discord
// recap, and it INNER JOINed the lead brand: the co-sponsor was not merely
// unmentioned, it was structurally impossible to mention.
//
//   DEMO_DB=1 npx tsx tests/db/presented-by.mts

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
const { eq: sqlEq, inArray } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const {
  PRESENTED_BY, joinNames, presentedBy, presentersOf, presentersFor, presentedByLine, brandLogos,
} = await import("../../lib/presented-by.ts");
const { sponsorsOf, MAX_SPONSORS } = await import("../../lib/co-sponsor.ts");

const db = await getDb();

console.log("== the words, without a database ==");
{
  eq("nothing to say says nothing", joinNames([]), "");
  eq("…and the whole line is empty too", presentedBy([]), "");
  eq("one brand is one name", joinNames(["Ace Energy"]), "Ace Energy");
  eq("two brands are joined with 'and'", joinNames(["Ace Energy", "Northwind"]),
    "Ace Energy and Northwind");
  ok("…not with an ampersand or a comma",
    !joinNames(["Ace Energy", "Northwind"]).includes("&")
    && !joinNames(["Ace Energy", "Northwind"]).includes(","),
    "two brands who paid to appear together read as partners, not a logo list");
  eq("blank names are dropped rather than rendered as a gap", joinNames(["Ace", "  ", ""]), "Ace");
  eq("the full line carries the words", presentedBy(["Ace"]), `${PRESENTED_BY} Ace`);
  eq("…and both names", presentedBy(["Ace", "Northwind"]), `${PRESENTED_BY} Ace and Northwind`);
}

console.log("\n== against real brands: lead first, always ==");
const lead = { id: uid(), name: `ZZ Lead ${uid().slice(0, 6)}`, slug: `lead-${uid().slice(0, 8)}`, logoUrl: "https://x/l.png" };
const co = { id: uid(), name: `AA Co ${uid().slice(0, 6)}`, slug: `co-${uid().slice(0, 8)}`, logoUrl: null as string | null };
{
  await db.insert(schema.brands).values([
    { id: lead.id, name: lead.name, slug: lead.slug, logoUrl: lead.logoUrl, industry: "other" },
    { id: co.id, name: co.name, slug: co.slug, logoUrl: co.logoUrl, industry: "other" },
  ]);

  const solo = await presentersOf({ sponsorBrandId: lead.id, coSponsorBrandId: null });
  eq("one sponsor resolves to one presenter", solo.map((p) => p.name), [lead.name]);

  const both = await presentersOf({ sponsorBrandId: lead.id, coSponsorBrandId: co.id });
  // The co-sponsor's name sorts FIRST alphabetically and its id is unrelated to
  // insertion order. If this ever passes by accident, it passes in the wrong
  // order and somebody's deal is misrepresented.
  eq("the lead is first, not the alphabet", both.map((p) => p.name), [lead.name, co.name]);
  ok("…and the fixture would catch an alphabetical sort", co.name < lead.name,
    `${co.name} sorts before ${lead.name}`);

  eq("the finished line names both",
    await presentedByLine({ sponsorBrandId: lead.id, coSponsorBrandId: co.id }),
    `${PRESENTED_BY} ${lead.name} and ${co.name}`);

  eq("an unsponsored challenge says nothing",
    await presentedByLine({ sponsorBrandId: null, coSponsorBrandId: null }), "");

  // A brand row that has gone is not a sponsor. Rendering the id, or a blank,
  // would put a gap where a name should be.
  eq("a deleted brand is dropped, not rendered",
    (await presentersOf({ sponsorBrandId: lead.id, coSponsorBrandId: "brand-that-never-existed" }))
      .map((p) => p.name),
    [lead.name]);

  eq("logos come back in the same order", brandLogos(both), [lead.logoUrl]);
}

console.log("\n== the ordering rule is not restated here ==");
{
  const src = code("lib/presented-by.ts");
  ok("presenters are chosen by sponsorsOf, not by a second copy of the rule",
    /sponsorsOf\(c\)/.test(src) && !/coSponsorBrandId\s*\]/.test(src),
    "two files deciding the order is two files that can disagree");
  eq("…so the ceiling still holds", sponsorsOf({
    sponsorBrandId: lead.id, coSponsorBrandId: co.id,
  }).length, MAX_SPONSORS);
}

console.log("\n== many challenges, one query ==");
{
  const a = { id: uid(), sponsorBrandId: lead.id, coSponsorBrandId: co.id };
  const b = { id: uid(), sponsorBrandId: co.id, coSponsorBrandId: null };
  const c = { id: uid(), sponsorBrandId: null, coSponsorBrandId: null };
  const map = await presentersFor([a, b, c]);

  eq("a co-sponsored row gets both, lead first", map.get(a.id)?.map((p) => p.name), [lead.name, co.name]);
  eq("a solo row gets one", map.get(b.id)?.map((p) => p.name), [co.name]);
  ok("an unsponsored row is absent rather than empty", !map.has(c.id));
  eq("nothing sponsored means nothing queried", (await presentersFor([c])).size, 0);

  const src = code("lib/presented-by.ts");
  ok("the batch really is one query",
    /export async function presentersFor[\s\S]{0,900}inArray\(schema\.brands\.id, \[\.\.\.wanted\]\)/.test(src)
    && !/export async function presentersFor[\s\S]{0,900}for \([\s\S]{0,120}await presentersOf/.test(src),
    "presentersOf in a loop is the N+1 this codebase keeps removing");
}

console.log("\n== the weekly recap can name a co-sponsor at all ==");
{
  const src = code("lib/discord/week-feed.ts");
  ok("the inner join on the lead brand is gone",
    !/innerJoin\(schema\.brands, eq\(schema\.challenges\.sponsorBrandId/.test(src),
    "joining the lead made the co-sponsor structurally impossible to mention");
  ok("it selects both brand columns",
    /sponsorBrandId: schema\.challenges\.sponsorBrandId/.test(src)
    && /coSponsorBrandId: schema\.challenges\.coSponsorBrandId/.test(src));
  ok("…and resolves them in one batch", /presentersFor\(rows\)/.test(src));
  ok("it still only lists actually-sponsored challenges",
    /sponsorBrandId\} IS NOT NULL/.test(src),
    "the dropped join was also the filter — losing it would list every challenge");
  ok("a challenge whose brands are gone keeps its line",
    /names\.length \? ` — sponsored by/.test(src),
    "no sponsor clause is right; dropping the whole challenge is not");
}

console.log("\n== all three announcements name them ==");
{
  const src = code("lib/discord/announce.ts");
  const at = (fn: string) => {
    const i = src.indexOf(fn);
    return i < 0 ? "" : src.slice(i, i + 2600);
  };
  ok("the launch post names them", /presentedByLine\(ch\)/.test(at("export async function announceChallengeLaunched")));
  ok("…including the private-challenge branch",
    /presented,\s*\]\.filter\(Boolean\)/.test(at("export async function announceChallengeLaunched")),
    "a private challenge is bought and paid for like any other");
  ok("the ending reminder names them", /presentedByLine\(ch\)/.test(src.slice(src.indexOf("ending within the hour"))));
  ok("the result post names them",
    /presented/.test(at("export async function announceChallengeEnded"))
    && /presentedByLine/.test(at("export async function announceChallengeEnded")),
    "the result post is the most-read of the three and named nobody");
  ok("…and the result post asks for only the two ids",
    /sponsorBrandId: schema\.challenges\.sponsorBrandId,\s*coSponsorBrandId: schema\.challenges\.coSponsorBrandId,\s*\}\)\.from\(schema\.challenges\)/.test(src),
    "a full row select for two columns on every ended challenge");
  ok("an empty line never becomes a blank row",
    (src.match(/\.filter\(Boolean\)\.join\("\\n"\)/g) ?? []).length >= 3,
    "unsponsored challenges must not gain an empty line in their post");
}

console.log("\n== the web page shows it, and never before it is paid ==");
{
  const src = code("app/planets/[slug]/challenges/[challengeId]/page.tsx");
  ok("the challenge page resolves presenters", /await presentersOf\(challenge\)/.test(src));
  ok("…withheld while the stage is draft",
    /stage === "draft" \? \[\] : await presentersOf\(challenge\)/.test(src),
    "stageOf returns draft for an UNPAID challenge — that is the case that matters");
  ok("…and renders nothing when there is nobody",
    /presenters\.length > 0 && \(/.test(src));
  ok("the brand name is not a link to the brand portal",
    !/href=\{`\/brands\/\$\{p\.slug\}`\}/.test(src),
    "/brands/[slug] is the brand's key-gated back office, not a public page");
}

console.log("\n== the paid gate is real, not assumed ==");
{
  // The claim in the code comment is that announcing is already gated on the
  // bill, so a name that reaches an announcement has been paid for. If that
  // stops being true, this file's reasoning stops being true with it.
  const billing = code("lib/challenge-billing.ts");
  ok("billing still reads BOTH brands before calling it paid",
    /paidBrandIds\.has\(payer\.id\) && paidBrandIds\.has\(coPayer\.id\)/.test(billing),
    "one brand's money funding the other's exposure is the defect B101 closed");
}

// Fixtures out.
await db.delete(schema.brands).where(inArray(schema.brands.id, [lead.id, co.id]));
void sqlEq;

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
