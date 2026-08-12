/**
 * WHAT THE PUBLIC PAGES SAY IS TRUE. B1 follow-on.
 *
 * ===== WHAT WAS WRONG =====
 *
 * The CMS defaults are the public website — every visitor sees them until an
 * admin edits one, and most are never edited. Four claims in them were false:
 *
 *   "100% — of gamers are on Discord"   fabricated, unsourced, and the first
 *                                       number a media buyer or investor checks
 *   "Six worlds, one weekly challenge"  RIGHT, and I broke it — see below
 *   "{threshold} linked gamers moves    it is where a server STARTS earning;
 *    you up a bracket"                  the brackets above it are other rungs
 *   "Most of it isn't ad spend"         directly above "Half of what you pay",
 *                                       and the two lines are read together
 *
 * ===== WHAT IS ASSERTED =====
 *
 * Properties, not the four strings. A test that pinned the new copy would go
 * red the first time somebody improved a sentence, and would catch nothing when
 * somebody added a fifth false claim next to it.
 *
 * ===== AND THE FIXTURE IS NOT THE PRODUCT =====
 *
 * Three of the four were false. "Six worlds" was TRUE: production runs six
 * games. I called it wrong by counting the PGlite demo, which seeds fourteen,
 * and the first version of this suite then asserted that count — enforcing a
 * falsehood about production from inside the file meant to prevent exactly
 * that. No count is asserted here now; the copy asks the page, and the page
 * reads the live table.
 *
 *   DEMO_DB=1 npx tsx tests/db/public-copy.mts
 */
process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const { CONTENT_DEFAULTS } = await import("../../lib/cms.ts");
const { EARN_FLOOR, RUNGS } = await import("../../lib/ladder.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq } = await import("drizzle-orm");

const db = await getDb();
const entries = Object.entries(CONTENT_DEFAULTS);
/** Prose only — image urls, hex colours and numeric knobs are not claims. */
const prose = entries.filter(([k, v]) =>
  typeof v === "string" && v.length > 12 && !/^https?:|^\/|^#[0-9a-f]{3,8}$/i.test(v)
  && !/\.(logo|icon|bg|art|astronaut|rocket|favicon|wordmark)\b/.test(k));

console.log("== no unsourced claim about a whole population ==");
{
  // "100% of gamers are on Discord". A claim that cannot survive one question
  // costs more than it buys, and it sat above copy asking a buyer to trust our
  // counting.
  const bad = prose.filter(([, v]) =>
    /\b(100|9\d)\s*%\s*of\b/i.test(v) || /\ball (gamers|players|users)\b/i.test(v));
  ok("no CMS default claims a near-total share of a population",
    bad.length === 0, bad.map(([k]) => k).join(", "));

  const stat = String(CONTENT_DEFAULTS["brand.insight.statLabel"] ?? "")
    + " " + String(CONTENT_DEFAULTS["brand.insight.stat"] ?? "");
  ok("…and the insight stat is not the old fabricated one",
    !/100/.test(stat) || !/gamers are on/i.test(stat), stat);
}

console.log("== no copy hardcodes a count the product decides ==");
{
  // ===== THIS SUITE RUNS ON THE DEMO. THE DEMO IS NOT THE PRODUCT. =====
  //
  // The first version of this block read the game count out of the database it
  // was running against and asserted "the product has more games than the old
  // copy claimed". That database is the PGlite demo, which seeds fourteen games.
  // Production runs six. So the assertion was true of the fixture, false of the
  // product, and would have passed in CI forever while enforcing a falsehood —
  // exactly the failure mode this whole file exists to catch, committed inside
  // the file that catches it.
  //
  // It was also how I broke the copy in the first place: "Six worlds" was RIGHT,
  // and I replaced it with vague prose because the demo said fourteen.
  //
  // So no count is asserted here at all. The rule is that copy must not STATE
  // one — it asks the page for it, and the page reads the live table.
  const WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(worlds|games|planets)\b/i;
  const bad = prose.filter(([, v]) => WORDS.test(v) && !/\{games\}/.test(v));
  ok("no CMS default states a number of games", bad.length === 0,
    bad.map(([k, v]) => `${k}: ${(v.match(WORDS) ?? [""])[0]}`).join(" · "));

  const note = String(CONTENT_DEFAULTS["hero.banner.note"] ?? "");
  ok("the banner note asks for the live count", note.includes("{games}"), note);

  // …and the page actually substitutes it, or the placeholder ships to a visitor.
  const page = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
  ok("…and the page substitutes it", /replace\("\{games\}"/.test(page),
    "{games} would render literally on the homepage");
}

console.log("== the earning bar is described as what it is ==");
{
  const sub = String(CONTENT_DEFAULTS["discord.hero.subtitle"] ?? "");
  ok("the owner subtitle substitutes the live floor rather than typing one",
    sub.includes("{threshold}"), sub.slice(0, 80));
  ok("…and no digit stands in for it", !/\b\d{2,}\s+linked\s+gamers/i.test(sub), sub);

  // THE CLAIM ITSELF. EARN_FLOOR is where earning starts; the brackets above it
  // are RUNGS[1..]. Saying the floor "moves you up a bracket" describes a
  // different number entirely.
  const near = sub.slice(Math.max(0, sub.indexOf("{threshold}") - 40), sub.indexOf("{threshold}") + 90);
  ok("…and it is not described as a bracket promotion",
    !/bracket/i.test(near) || /starts earning/i.test(near), near);

  ok("the floor and the first bracket really are different numbers",
    EARN_FLOOR !== RUNGS[1].threshold, `${EARN_FLOOR} vs ${RUNGS[1].threshold}`);
}

console.log("== two lines about the same figure agree ==");
{
  // "Most of it isn't ad spend" over "Half of what you pay goes to the players".
  const title = String(CONTENT_DEFAULTS["brand.prize.title"] ?? "");
  const body = String(CONTENT_DEFAULTS["brand.prize.body"] ?? "");
  const saysHalf = (s: string) => /\bhalf\b|\b50\s*%/i.test(s);
  const saysMost = (s: string) => /\bmost\b|\bmajority\b/i.test(s);
  ok("the prize headline does not say 'most' while the body says 'half'",
    !(saysMost(title) && saysHalf(body)), `${title} // ${body.slice(0, 60)}`);
}

console.log("== and nothing quotes the retired ladder ==");
{
  // The same sweep the docs get, applied to the copy a visitor actually reads.
  const bad = prose.filter(([, v]) =>
    /\d+\s*%\s*at\s*[\d,]{2,}/i.test(v) || /(link|reach|hit|cross)\s+[\d,]{3,}\s+(linked\s+)?(gamers|members)/i.test(v));
  ok("no CMS default quotes a retired member bar or an owner rate",
    bad.length === 0, bad.map(([k]) => k).join(", "));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
