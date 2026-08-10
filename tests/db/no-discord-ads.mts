/**
 * The bot is a delivery engine, not an ad network. M4.
 *
 * ===== WHAT THIS EXISTS TO STOP COMING BACK =====
 *
 * Cluster used to sell the top-right corner of every card ClusterBot draws. A
 * brand uploaded one image in the brand portal and it went out network-wide —
 * on profile cards, leaderboards, planets, anything a gamer opened — with a
 * button under it reading `Sponsored: <brand> — <their tagline>`.
 *
 * That is advertising inside somebody else's Discord community, and it is not
 * the product. The product is a SPONSORED CHALLENGE: a brand funds a prize
 * pool, the bot delivers the competition to gamers in the servers they already
 * live in, and the brand is reported on ENTRANTS — people who actually played —
 * rather than impressions. A brand logo on a challenge card is part of the
 * challenge that brand paid for. A brand logo on a stranger's profile card is
 * an advert.
 *
 * ===== WHY THE CHECKS ARE SHAPED LIKE THIS =====
 *
 * Nothing was deleted in M4, which is the right call and also the risk: the
 * placement, the tables, the rotation and the upload path all still exist and
 * still work. So a check that only looked for a missing file would pass while
 * the offer quietly came back. What is asserted instead is the BOUNDARY:
 *
 *   - the serve is house-only, enforced where the serving happens
 *   - the endpoints refuse, not merely the forms
 *   - the word "Sponsored" is off the card and off the button
 *
 *   DEMO_DB=1 npx tsx tests/db/no-discord-ads.mts
 */
process.env.DEMO_DB = "1";

import { readFileSync, readdirSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const at = (p: string) => new URL(`../../${p}`, import.meta.url);
const read = (p: string) => readFileSync(at(p), "utf8");
/** Source with comments stripped — a comment explaining the old behaviour is not the old behaviour. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

const { sponsorButtonLabel, HOUSE_CTA, PREVIEW_AD } = await import("../../lib/cards/ads.ts");
const { HOUSE_BRAND_ID } = await import("../../lib/house-brand.ts");

console.log("== the word 'Sponsored' is off the bot ==");
{
  // THE BUTTON. It used to open with "Sponsored: " and the brand's name — which
  // was correct disclosure while the slot was for sale. It is house-only now,
  // so that label would have Cluster declaring itself its own sponsor.
  const label = sponsorButtonLabel({ brandName: "Cluster", ctaLabel: HOUSE_CTA });
  ok("the button does not say 'Sponsored'", !/sponsored/i.test(label), label);
  ok("…and still names who is speaking", label.includes("Cluster"), label);
  ok("…and still fits Discord's 80-character cap", label.length <= 80, String(label.length));

  // Even if somebody passes a brand name in, the word must not reappear.
  const other = sponsorButtonLabel({ brandName: "Some Brand", ctaLabel: "buy our thing" });
  ok("…and cannot be talked into saying it", !/sponsored/i.test(other), other);

  // THE STRIP ON THE CARD ITSELF. `label` used to default to "Sponsored".
  const render = code("lib/cards/render.tsx");
  ok("the card strip does not default to 'Sponsored'",
    !/ad\.label\s*\|\|\s*["'`]Sponsored/i.test(render),
    "a defaulted label stamps a sponsor on a panel nobody bought");
  ok("…and the admin preview does not either",
    !/sponsored/i.test(String(PREVIEW_AD.label ?? "")), String(PREVIEW_AD.label));
}

console.log("\n== the Discord slot serves the house and nobody else ==");
{
  // Enforced AT THE SERVE, not at the upload. An upload guard only governs what
  // arrives next; any brand creative already attached to this placement — from
  // before M4, or from a row an admin wrote by hand — would keep going out to
  // every server on the network.
  const ads = code("lib/cards/ads.ts");
  ok("pickCardAd filters on the house brand", /brandId === HOUSE_BRAND_ID/.test(ads),
    "without this the slot still serves whatever is attached to the placement");
  ok("…and the filter is in the serve, not only the upload",
    ads.split("export async function pickCardAd")[1]?.split("\n}")[0]?.includes("HOUSE_BRAND_ID") === true,
    "a guard outside pickCardAd does not govern rows that already exist");

  // The id has to survive the query it is filtered on, or the filter silently
  // matches nothing and the slot goes blank for everybody.
  const served = code("lib/ads.ts");
  ok("serveAds carries a brandId through", /brandId:\s*schema\.brands\.id/.test(served));
  ok("…and onto the served creative", /brandId:\s*r\.brandId/.test(served));
  ok("the house brand id is a real constant", typeof HOUSE_BRAND_ID === "string" && HOUSE_BRAND_ID.length > 0);
}

console.log("\n== the endpoints refuse, not just the forms ==");
{
  // A server action is a live HTTP endpoint gated only by `requireBrand`. A
  // brand holding their own portal key could post to it long after the form
  // disappeared, so unmounting the UI is not the fix — it is half of it.
  const actions = read("app/actions/brand-portal.ts");
  for (const fn of ["portalLaunchCardCreative", "portalRemoveCardCreative", "portalSetCardCampaignRunning"]) {
    const body = actions.split(`export async function ${fn}`)[1]?.split("\n}")[0] ?? "";
    ok(`${fn} refuses`, /CARD_SLOT_CLOSED/.test(body), body.slice(0, 120).replace(/\n/g, " "));
    ok(`…and ${fn} refuses BEFORE writing anything`,
      !/db\.insert|db\.update|db\.delete/.test(body),
      "a refusal after a write is not a refusal");
  }
  // The refusal has to point somewhere. A brand's underlying want is real and
  // we do sell it — as a challenge.
  ok("…and the refusal explains what to buy instead",
    /sponsor a challenge/i.test(actions) && /entrants/i.test(actions));
}

console.log("\n== the brand portal offers no Discord placement ==");
{
  const portal = code("app/brands/[slug]/page.tsx");
  ok("the brand page does not mount the card panel", !/<BrandCardCampaign/.test(portal),
    "the panel is the offer; rendering it is offering it");
  ok("…and does not even fetch the card campaign", !/getCardCampaign/.test(portal));

  // The panel file is KEPT — M4 removes the offer, not the machinery — but it
  // must be reachable from nothing.
  const walk = (dir: string): string[] => readdirSync(at(dir), { withFileTypes: true })
    .flatMap((e) => e.name.startsWith(".") || e.name === "node_modules"
      ? []
      : e.isDirectory() ? walk(`${dir}/${e.name}`)
        : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
  const importers = [...walk("app"), ...walk("components"), ...walk("lib")]
    .filter((f) => f !== "components/BrandCardCampaign.tsx")
    .filter((f) => /BrandCardCampaign/.test(read(f)));
  ok("…and nothing anywhere imports it", importers.length === 0, importers.join(", "));
}

console.log("\n== nothing tells a brand they can put a creative on Discord ==");
{
  // The sweep. Each of these was a real sentence on a real page: the brand
  // login promised "your Discord card campaign", the portal panel's headline
  // was "Your creative on every card the bot draws".
  //
  // What is NOT swept: general "advertise on Discord" positioning. That is the
  // pitch and it is true — the bot is how a sponsored challenge reaches gamers
  // in their own home. The line being drawn is between DELIVERING a challenge
  // and RENTING space, not between mentioning Discord and not.
  const SOLD = [
    /your (discord )?card campaign/i,
    /your creative on every card/i,
    /upload .{0,40}creative .{0,30}(discord card|every card)/i,
    /buy .{0,30}(the )?discord card/i,
  ];
  const walk = (dir: string): string[] => readdirSync(at(dir), { withFileTypes: true })
    .flatMap((e) => e.name.startsWith(".") || e.name === "node_modules"
      ? []
      : e.isDirectory() ? walk(`${dir}/${e.name}`)
        : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);

  const hits: string[] = [];
  for (const f of [...walk("app"), ...walk("components")]) {
    // The unmounted panel still describes the offer it used to make; it is
    // reachable from nothing, which the check above proves.
    if (f === "components/BrandCardCampaign.tsx") continue;
    const src = code(f);
    for (const re of SOLD) if (re.test(src)) hits.push(`${f}: ${re}`);
  }
  ok("no page still offers a brand the Discord card", hits.length === 0, hits.join(" · "));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map((f) => `  ✗ ${f}`).join("\n")); process.exit(1); }
