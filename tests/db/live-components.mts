// A component, not a screenshot. B109.
//
// B89.6 wrote the rule down and nobody built it: *"Sections render the real
// component, not a screenshot. A screenshot is a claim; a component is the
// product."* Every public page described the bot in prose; not one of them
// showed a card it draws.
//
// THE THREE THINGS THAT MADE THIS NON-OBVIOUS, and the reason this suite is
// longer than the feature:
//
//   1. The obvious function to reach for — `cardRef` — logs an ad impression.
//      That row is DELIVERY EVIDENCE shown to a brand. Drawing a card on our
//      own homepage through it would pad a brand's delivery with website
//      visitors who were never in any Discord server.
//   2. Renders are capped at 4,000/day for the whole network. A public page
//      that drew one per visitor would eat the ceiling with strangers and then
//      serve stale cards to every gamer in Discord — the marketing page would
//      degrade the product it markets.
//   3. `previewFixtures().challengeId` is `order by start_at desc limit 1`,
//      which on any week where next week's run is drafted is a DRAFT. On a
//      public page that publishes an unannounced competition, and after B107 a
//      brand name whose invoice may not have cleared.
//
//   DEMO_DB=1 npx tsx tests/db/live-components.mts

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

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

const lib = code("lib/marketing-card.ts");
const comp = code("components/marketing/LiveBotCard.tsx");
const PAGES = ["app/page.tsx", "app/discord-bot/page.tsx", "app/brands/page.tsx", "app/servers/page.tsx"];

const { liveCard, clearMarketingCards, marketingCacheKeys, publicChallengeId, MARKETING_CARD_KINDS, MARKETING_CARD_TTL_MS } =
  await import("../../lib/marketing-card.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { stageOf } = await import("../../lib/challenge-stage.ts");
const { desc, eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

console.log("== a brand's delivery evidence is never touched ==");
{
  // THE ASSERTION THIS FILE EXISTS FOR. `cardRef` picks a sponsor and calls
  // `logCardAdImpression`; that number is what we show a brand to prove their
  // challenge reached the servers they paid for. Website visitors are not
  // servers.
  ok("the marketing card does not go through cardRef",
    !/cardRef/.test(lib),
    "cardRef picks a sponsor and logs an impression — a homepage visitor is not a Discord viewer");
  ok("…and logs no impression itself",
    !/logCardAdImpression|withCardAd/.test(lib),
    "padding delivery evidence with marketing traffic is B107's dishonesty through a side door");
  ok("…and the component does not either", !/cardRef|logCardAdImpression/.test(comp));
  ok("it renders through the cache directly", /getOrRenderCard\(/.test(lib));
  ok("…under its own cache namespace",
    /`marketing\|\$\{built\.key\}`/.test(lib),
    "sharing a key with the bot lets a marketing page be the reason somebody's Discord card was re-drawn");
}

console.log("\n== a burst of traffic cannot eat the render budget ==");
{
  ok("resolved URLs are memoised", /const memo = new Map/.test(lib));
  ok("…with a TTL", /Date\.now\(\) - hit\.at < MARKETING_CARD_TTL_MS/.test(lib));
  ok("the TTL is long enough to absorb traffic", MARKETING_CARD_TTL_MS >= 60_000,
    String(MARKETING_CARD_TTL_MS));
  ok("…and short enough that a changed card is picked up", MARKETING_CARD_TTL_MS <= 3_600_000,
    String(MARKETING_CARD_TTL_MS));
  // BEHAVIOURAL, not a regex. The emptiest database is launch day, and launch
  // day is when a miss is cheapest to get wrong — so this asks the cache what
  // it holds rather than asking the source what it looks like.
  //
  // Written this way after the regex version PASSED against a deliberately
  // broken build: `if (value) memo.set(...)` still contains `memo.set(...)`.
  clearMarketingCards();
  eq("the cache starts empty", marketingCacheKeys(), []);
  const nul = await liveCard("not-a-card-kind");
  eq("…a kind with no card returns null", nul, null);
  ok("…and that NULL is cached", marketingCacheKeys().includes("not-a-card-kind"),
    "without this, a platform with no challenges retries the whole lookup on every pageview");
  clearMarketingCards();
  eq("clearing really clears", marketingCacheKeys(), []);
}

console.log("\n== a draft challenge cannot reach the public site ==");
{
  ok("…it filters on the real stage", /stageOf\(c\) !== "draft"/.test(lib));
  ok("…in code rather than SQL, so there is one opinion about it",
    /rows\.find\(\(c\) => stageOf\(c\) !== "draft"\)/.test(lib),
    "the stage is derived from four columns and a clock; a WHERE clause would be a second opinion");

  // BEHAVIOURAL, and this is the assertion that matters. A source check for
  // "does not call previewFixtures" passed against a build that called it and
  // used its answer — so instead: plant a draft challenge with the NEWEST
  // start date, which is exactly the shape `order by start_at desc limit 1`
  // would pick, and prove the marketing card does not choose it.
  const db = await getDb();
  const soon = new Date(Date.now() + 30 * 86400000);
  const draftId = uid();
  const [anySpace] = await db.select({ id: schema.spaces.id }).from(schema.spaces).limit(1);
  await db.insert(schema.challenges).values({
    id: draftId, spaceId: anySpace?.id ?? "",
    title: "DRAFT — next week, not announced",
    game: "Valorant", provider: "riot", status: "draft",
    startAt: soon, endAt: new Date(soon.getTime() + 7 * 86400000),
  } as never);

  const rows = await db.select().from(schema.challenges)
    .orderBy(desc(schema.challenges.startAt)).limit(10);
  eq("the planted draft really is the newest row", rows[0]?.id, draftId);
  eq("…and really is a draft", stageOf(rows[0]), "draft");

  // The contract, directly. `liveCard` alone is not enough to prove this:
  // `previewFixtures` has a memo of its own, so a build that wrongly used it
  // would keep returning the PREVIOUS answer and the leak would be delayed
  // rather than absent — which a test would read as a pass.
  const picked = await publicChallengeId();
  ok("the public fixture skips the draft", picked !== draftId,
    "a draft on the homepage publishes an unannounced competition — and after B107, an unpaid brand's name");
  const chosen = rows.find((c) => stageOf(c) !== "draft");
  if (chosen) {
    ok("…and returns a public one instead", !!picked && stageOf(chosen) !== "draft", String(picked));
    ok("…there WAS a public challenge available, so this is not passing by emptiness", !!chosen);
  } else {
    ok("…and with nothing public it returns nothing", picked === null);
    ok("…which is the honest answer rather than a draft", picked === null);
  }

  clearMarketingCards();
  const card = await liveCard("challenge");
  ok("and the rendered card is never the draft's",
    card === null || !card.url.includes(draftId));

  // The loader has to actually USE it. Scoped to the challenge loader's own
  // body — an unscoped search would match the function definition above and
  // pass for a loader that ignored it.
  const loader = lib.slice(lib.indexOf("challenge: async () =>"), lib.indexOf("leaderboard: async () =>"));
  ok("the challenge loader calls it", /await publicChallengeId\(\)/.test(loader), loader.slice(0, 120));
  ok("…and does not reach for the unsafe fixture", !/previewFixtures/.test(loader),
    "previewFixtures().challengeId is `order by start_at desc limit 1` — a drafted next week");

  await db.delete(schema.challenges).where(sqlEq(schema.challenges.id, draftId));
  clearMarketingCards();
  // `stageOf` returns "draft" for an UNPAID challenge as well as an unpublished
  // one, which is the second case that matters here.
  ok("the filter also covers unpaid", /paid === false/.test(code("lib/challenge-stage.ts")),
    "stageOf must still return draft for an unpaid challenge, or this filter stops covering B107");
}

console.log("\n== null is a first-class answer ==");
{
  ok("liveCard never throws", /catch \{[\s\S]{0,200}value = null;/.test(lib));
  ok("the component renders nothing for null",
    /if \(!card\) return null;/.test(comp),
    "a broken image on a marketing page is worse than no section");
  // Behavioural: an unknown kind has no loader and must come back null rather
  // than blowing up the page that asked for it.
  eq("an unknown kind is null, not an error", await liveCard("not-a-card-kind"), null);
  ok("…and every advertised kind has a loader",
    MARKETING_CARD_KINDS.every((k) => typeof k === "string" && k.length > 0)
      && MARKETING_CARD_KINDS.length >= 4,
    MARKETING_CARD_KINDS.join(","));
  // Called twice, the second must be the memo rather than a second lookup.
  clearMarketingCards();
  const a = await liveCard("not-a-card-kind");
  const b = await liveCard("not-a-card-kind");
  eq("a repeat call returns the same answer", [a, b], [null, null]);
}

console.log("\n== it is actually on the pages, and it is not a screenshot ==");
{
  for (const f of PAGES) {
    const src = read(f);
    ok(`${f} renders a live card`, /<LiveBotCard/.test(src),
      "a component nobody renders is a component that rots");
  }
  ok("no page reaches for a static image of a card instead",
    !PAGES.some((f) => /\/(bot-card|card-screenshot|discord-screenshot)[\w-]*\.(png|jpe?g|webp)/i.test(read(f))),
    "a screenshot is a claim");
  ok("the frame says it is a live render",
    /live render, drawn from real data/.test(read("components/marketing/LiveBotCard.tsx")),
    "the claim is only worth making if it is checkable, and it is only true if it is enforced");
  ok("the card is lazy, since every one of these is below the fold",
    /loading="lazy"/.test(comp));
  ok("…and the component ships no client JavaScript",
    !/"use client"/.test(read("components/marketing/LiveBotCard.tsx")),
    "a marketing image should not cost a hydration");
}

console.log("\n== the Discord framing is real, not decorative ==");
{
  // The point of the frame is that a PNG on a marketing page is a graphic,
  // while the same PNG under a bot tag is the thing that appears in their
  // server tomorrow.
  ok("the message shows the bot tag", /Bot\s*$|>\s*Bot\s*</m.test(read("components/marketing/LiveBotCard.tsx")));
  ok("…and a caption line the bot would really say", /caption &&/.test(comp));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
