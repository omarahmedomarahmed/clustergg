// What a view is, and what a brand may be told about it. B81 + B82.
//
// The defect these tests exist against was not a bug. It was a number that
// worked exactly as written: `mediaValue` took a server's MEMBER COUNT,
// multiplied it by a benchmark CPM, and printed the result under a heading
// reading "Counted delivery". Nobody had seen those members. It survived for
// months because every individual line of it was correct.
//
// So the assertions here are mostly NEGATIVE — about what cannot be computed,
// what cannot be returned, and what cannot be shown. A test that only checked
// the counts were right would have passed against the broken version too.
//
//   DEMO_DB=1 npx tsx tests/db/ad-views.mts

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

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

const { getDb, schema } = await import("../../lib/db/index.ts");
const { and, eq: sqlEq, sql } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { deliveryFor, brandCreativeIds, MIN_COHORT, AUDIENCE_NOTE } =
  await import("../../lib/ad-delivery.ts");

const db = await getDb();

console.log("== the definition is written down, and honestly ==");
{
  // Moved from docs/legacy to docs/DELIVERY.md when the legacy folder was
  // purged. The commitment is the PRODUCT'S, not a former product's: we report
  // what happened and never model, estimate or multiply it. Deleting it with
  // the rest of the old plan would have thrown away a promise we still keep.
  const doc = src("docs/DELIVERY.md");
  ok("the document exists and states the rule", /One card carrying a creative/i.test(doc));
  // The three admissions that make it worth reading. Each of them costs us
  // something, which is exactly why a reviewer should check they survived.
  ok("…it refuses to multiply a post by an audience estimate",
    /do not multiply a public post/i.test(doc));
  ok("…it says plainly this is not an IAB viewable impression",
    /not an IAB viewable impression/i.test(doc));
  ok("…and it lists what we cannot see", /What we cannot see/i.test(doc));
  ok("…including that we cannot tell how long a card was on screen",
    /how long/i.test(doc));
  ok("the privacy bound is in the document, not only in the code",
    new RegExp(`minimum cohort ${MIN_COHORT}`, "i").test(doc));
}

console.log("\n== B81.2: every row says where it came from ==");
{
  // All three writers must stamp both columns. A row that cannot say what it
  // was forces the report to guess, and a report that guesses is the thing
  // being replaced.
  ok("the web beacon stamps a surface", /surface: "web"/.test(code("app/api/ads/beacon/route.ts")));
  ok("…and a card kind", /cardKind: "web"/.test(code("app/api/ads/beacon/route.ts")));
  ok("the scheduled server post stamps public", /surface: "discord_public"/.test(code("lib/discord/ads.ts")));
  const cards = code("lib/cards/ads.ts");
  ok("a card knows whether it was private", /discord_private/.test(cards));
  ok("…and a DM counts as private", /!meta\.guildId \? "discord_private"/.test(cards));

  // NO `views` COLUMN AND NO `estimated` FLAG. One row is one view, so there is
  // nothing to weight and nothing to get wrong.
  const schemaSrc = code("lib/db/schema.ts");
  const impressions = schemaSrc.slice(
    schemaSrc.indexOf('export const adImpressions'),
    schemaSrc.indexOf('export const adClicks'),
  );
  ok("ad_impressions has no views column", !/\bviews:\s*integer/.test(impressions));
  ok("…and no estimated flag", !/estimated/i.test(impressions));
}

console.log("\n== one card is one row, and a cached card is not a second one ==");
{
  const tag = uid().slice(0, 8);
  const [placement] = await db.select({ id: schema.adPlacements.id }).from(schema.adPlacements).limit(1);
  const [creative] = await db.select({ id: schema.adCreatives.id }).from(schema.adCreatives).limit(1);
  const [brandRow] = await db.select({ id: schema.brands.id }).from(schema.brands).limit(1);

  const campaignId = uid();
  await db.insert(schema.adCampaigns).values({
    id: campaignId, brandId: brandRow.id, name: `Delivery ${tag}`,
    startDate: new Date(Date.now() - 86400_000), endDate: new Date(Date.now() + 86400_000),
  });
  const ccId = uid();
  await db.insert(schema.adCampaignCreatives).values({
    id: ccId, campaignId, creativeId: creative.id, placementId: placement.id,
  });

  const logCard = (kind: string, guildId: string | null, viewer: string | null) =>
    db.insert(schema.adImpressions).values({
      id: uid(), campaignCreativeId: ccId, cardKind: kind,
      surface: guildId ? "discord_public" : "discord_private",
      guildId, userId: viewer, dedupeKey: `${ccId}:${viewer ?? uid()}:${kind}:${uid()}`,
    });

  await logCard("profile", null, null);
  const [one] = await db.select({ n: sql<number>`count(*)` }).from(schema.adImpressions)
    .where(sqlEq(schema.adImpressions.campaignCreativeId, ccId));
  eq("one card logs exactly one row", Number(one.n), 1);

  // A card posted into a 4,000-member server is ONE row. This is the assertion
  // the whole document exists for.
  const bigGuild = `av-big-${tag}`;
  await db.insert(schema.discordGuilds).values({
    guildId: bigGuild, name: `Big ${tag}`, memberCount: 4000,
  }).onConflictDoNothing();
  await logCard("challenge", bigGuild, null);
  const [two] = await db.select({ n: sql<number>`count(*)` }).from(schema.adImpressions)
    .where(sqlEq(schema.adImpressions.campaignCreativeId, ccId));
  eq("a public post into 4,000 members logs one row, not 4,000", Number(two.n), 2);

  // The dedupe index: a second write on the same key is a no-op rather than a
  // second row. This is what stopped a rotating web slot turning one idle tab
  // into twelve views a minute.
  const key = `${ccId}:dupe:${tag}`;
  await db.insert(schema.adImpressions).values({
    id: uid(), campaignCreativeId: ccId, cardKind: "profile", surface: "web", dedupeKey: key,
  }).onConflictDoNothing();
  await db.insert(schema.adImpressions).values({
    id: uid(), campaignCreativeId: ccId, cardKind: "profile", surface: "web", dedupeKey: key,
  }).onConflictDoNothing();
  const [three] = await db.select({ n: sql<number>`count(*)` }).from(schema.adImpressions)
    .where(sqlEq(schema.adImpressions.campaignCreativeId, ccId));
  eq("a re-served card neither double-counts nor skips", Number(three.n), 3);

  console.log("\n== B82: the report is the rows, and nothing else ==");
  const d = await deliveryFor(db, [ccId]);
  eq("the headline is the row count", d.views, 3);
  const summed = d.byCardKind.reduce((a, r) => a + r.views, 0)
    + d.byPlacement.reduce((a, r) => a + r.views, 0);
  eq("…and the breakdowns add back to it", summed, d.views);

  // The 4,000-member server contributes ONE view and its headcount appears only
  // as context beside it.
  const big = d.byServer.find((r) => r.label === `Big ${tag}`);
  eq("a big server contributes its views, not its members", big?.views, 1);
  eq("…and its headcount rides along as context", big?.members, 4000);
  ok("…and no figure anywhere equals views × members",
    !d.byServer.some((r) => r.members != null && r.views * r.members === d.views));

  // A card with no guild is a DM, and it is named rather than dropped.
  ok("direct messages are named, not hidden",
    d.byServer.some((r) => r.label === "Direct message"), JSON.stringify(d.byServer));

  console.log("\n== the cohort bound ==");
  ok("composition is suppressed under the minimum", d.audience.length === 0);
  ok("…and says so rather than showing nothing", d.audienceSuppressed === (d.attributedViewers > 0));
  ok("the note explains why percentages exceed 100", /more than 100%/.test(AUDIENCE_NOTE));
  ok("…and states the suppression threshold", AUDIENCE_NOTE.includes(String(MIN_COHORT)));

  // Now give it a real cohort and check the percentage appears — a suppression
  // that never lifts is a feature nobody can tell is broken.
  const viewers: string[] = [];
  for (let i = 0; i < MIN_COHORT + 2; i++) {
    const userId = uid();
    await db.insert(schema.users).values({
      id: userId, email: `${userId}@av.test`, displayName: `AV ${i}`,
      slug: `av-${tag}-${i}`, passwordHash: "x", ageBand: "adult",
    });
    await db.insert(schema.linkedGameAccounts).values({
      id: uid(), userId, provider: "chesscom", providerAccountId: `av-${tag}-${i}`,
      inGameName: `av${i}`, verified: true,
    });
    await logCard("profile", bigGuild, userId);
    viewers.push(userId);
  }
  const d2 = await deliveryFor(db, [ccId]);
  ok("a cohort at the threshold is reported", !d2.audienceSuppressed, JSON.stringify(d2.audience));
  const chess = d2.audience.find((a) => a.game === "chesscom");
  ok("…with a real percentage", (chess?.pct ?? 0) > 0, JSON.stringify(chess));
  ok("…of the ATTRIBUTED viewers, not of every view",
    d2.attributedViewers === viewers.length, `${d2.attributedViewers} vs ${viewers.length}`);
  // A slice under the threshold within a big enough cohort is still suppressed.
  const rare = uid();
  await db.insert(schema.users).values({
    id: rare, email: `${rare}@av.test`, displayName: "Rare", slug: `av-rare-${tag}`,
    passwordHash: "x", ageBand: "adult",
  });
  await db.insert(schema.linkedGameAccounts).values({
    id: uid(), userId: rare, provider: "lichess", providerAccountId: `av-rare-${tag}`,
    inGameName: "rare", verified: true,
  });
  await logCard("profile", bigGuild, rare);
  const d3 = await deliveryFor(db, [ccId]);
  const lone = d3.audience.find((a) => a.game === "lichess");
  ok("a slice too small to report is null, never 0%", lone !== undefined && lone.pct === null,
    JSON.stringify(lone));
}

console.log("\n== B81.3: no brand-facing figure comes from anything but rows ==");
{
  const report = code("lib/ad-delivery.ts");
  // The two ingredients of the deleted defect: a member count and a benchmark.
  ok("the report imports no benchmark or rate card", !/benchmarkCp|PRICING/.test(report));
  ok("…and computes no media value", !/mediaValue|roas|returnOnSpend/i.test(report));
  // `memberCount` appears once, as CONTEXT on a row. It must never be an
  // operand.
  ok("a member count is never multiplied", !/members\s*\*/.test(report) && !/\*\s*members/.test(report));

  // NO IDENTITY. Not a user id, name, slug, handle or avatar, anywhere.
  for (const field of ["displayName", "slug", "avatarUrl", "discordUsername", "email"]) {
    ok(`the report never selects ${field}`, !new RegExp(`users\\.${field}`).test(report));
  }
  // `userId` appears only inside aggregates — count(distinct …) — never as a
  // selected column.
  ok("a user id is only ever counted, never returned",
    !/userId: schema\.adImpressions\.userId/.test(report));

  // `surface` is stored and must not reach a brand.
  ok("the surface is never grouped or returned",
    !/groupBy\(schema\.adImpressions\.surface\)/.test(report)
    && !/surface: schema\.adImpressions\.surface/.test(report));

  // UNBOUNDED READS. The old report loaded every impression into heap.
  ok("every brand-facing query aggregates in the database", /count\(\*\)/.test(report));
  ok("…and the per-server list is bounded", /\.limit\(serverLimit\)/.test(report));
  ok("…and so is the composition list", /\.limit\(20\)/.test(report));

  // Scoping is by creative ids resolved beforehand, so no argument reaches
  // another brand's rows.
  ok("delivery takes creative ids, never a brand id",
    /export async function deliveryFor\([\s\S]{0,120}creativeIds: string\[\]/.test(report));

  // And the component draws, it does not compute.
  const panel = code("components/AdDelivery.tsx");
  // Narrowed after this failed as first written: `*` matches inside Tailwind
  // class strings and JSX, so a bare search for it flags a component that does
  // nothing wrong. What must not exist is arithmetic ON THE FIGURES — the old
  // panel multiplied a member count by a CPM in the component itself.
  ok("the panel multiplies nothing", !/(views|members|viewers|pct)\s*[*/]/.test(panel));
  ok("…and rounds nothing, because rounding means it computed something",
    !/Math\.(round|floor|ceil)/.test(panel));
  ok("…and prints a suppressed slice as a dash, never 0%", /a\.pct == null \? "—"/.test(panel));
}

console.log("\n== the brand's own scope ==");
{
  const [brandRow] = await db.select({ id: schema.brands.id }).from(schema.brands).limit(1);
  const ids = await brandCreativeIds(db, brandRow.id);
  ok("a brand resolves to its own creatives", ids.length > 0);
  const none = await deliveryFor(db, []);
  eq("no creatives is an empty report, not everybody's", none.views, 0);
  ok("…and it says so plainly", /No cards/.test(none.note));
}

console.log("\n== B75.4: the frequency cap is an anti-fraud control ==");
{
  const { cardImpressionKey, CARD_IMPRESSION_WINDOW_HOURS } = await import("../../lib/cards/ads.ts");
  // One gamer, one creative, one DAY. Longer than the web beacon's hour on
  // purpose: a Discord card is a deliberate act by a person who typed
  // something, so twice in an evening is a real second delivery — forty is
  // somebody holding down a key.
  eq("the window is a day", CARD_IMPRESSION_WINDOW_HOURS, 24);
  const a = cardImpressionKey("cc1", "u1", new Date("2026-08-08T01:00:00Z"));
  const b = cardImpressionKey("cc1", "u1", new Date("2026-08-08T23:00:00Z"));
  eq("the same gamer on the same day is one key", a, b);
  ok("…a different day is not", a !== cardImpressionKey("cc1", "u1", new Date("2026-08-09T01:00:00Z")));
  ok("…a different gamer is not", a !== cardImpressionKey("cc1", "u2", new Date("2026-08-08T01:00:00Z")));
  ok("…and a different creative is not", a !== cardImpressionKey("cc2", "u1", new Date("2026-08-08T01:00:00Z")));

  const cards = code("lib/cards/ads.ts");
  ok("the cap is enforced by the unique index, not a check",
    /dedupeKey: cardImpressionKey/.test(cards) && /onConflictDoNothing/.test(cards));
  // A render we cannot attribute still logs — dropping it would UNDER-report,
  // which is the other way to be wrong.
  ok("an unattributable render still counts", /anon:\$\{meta\.guildId/.test(cards));
  ok("the viewer reaches the logger", /viewerId: currentCardViewer\(\)/.test(code("lib/discord/cards.ts")));
}

console.log("\n== B75.5: no silent cutoff ==");
{
  const ads = code("lib/ads.ts");
  // The defect: sort by priority, slice to `maxCreativesInRotation`, and the
  // fourth paying brand serves nothing while still being billed.
  ok("the rotation no longer slices the tail away",
    !/\.slice\(0, placement\.maxCreativesInRotation\)/.test(ads));
  ok("…it rotates the tail through the spare slots", /offset \+ i\) % tail\.length/.test(ads));
  ok("…on a window that advances with time", /now\.getTime\(\) \/ 3600_000/.test(ads));
  // Priority still leads — the point is that the TAIL rotates, not that
  // priority stops meaning anything.
  ok("…while top priority is always served", /r\.priority === topPriority/.test(ads));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
