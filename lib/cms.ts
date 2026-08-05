import { cache } from "react";
import { inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { BANNER_ART } from "@/lib/assets";
import { PRICING_COPY_DEFAULTS, PRICING_NUMBER_DEFAULTS } from "@/lib/pricing";

// Lightweight CMS: editable site content lives in platform_settings as
// key → string. Every consumer supplies a default so missing keys never break.

export const CONTENT_DEFAULTS: Record<string, string> = {
  // The commercial model — prices, and the copy that sells them.
  ...PRICING_NUMBER_DEFAULTS,
  ...PRICING_COPY_DEFAULTS,

  // ===================================================================
  // THE BRAND STORY
  // ===================================================================
  // What Cluster is, in the order it has to be said: gamers live on Discord →
  // brands pay twice to reach them anywhere else → Discord has no ads manager
  // → Cluster is the media-buying layer → and the unit isn't an impression,
  // it's a sponsored challenge gamers enter for the chance to win.
  //
  // The positioning is B2B SaaS for gaming marketing, not "a gaming platform
  // that also sells ads". Every line below is written to a media buyer who
  // already knows what a rate card, an impression and a ROAS figure are.
  //
  // Card lists are "Heading | body" per line (see `pairs()` in lib/pricing.ts),
  // so an admin edits one textarea instead of twelve fields.
  "brand.hero.badge": "Discord advertising, bought like advertising",
  "brand.hero.title": "Gamers live on Discord.",
  "brand.hero.title2": "Now you can advertise there.",
  "brand.hero.subtitle":
    "The media-buying layer for Discord gaming communities. Sponsor the weekly competition your audience was going to enter anyway — your name on it, your logo on the trophy, cost-per-entrant reported back. $250 a challenge; $175 goes to the gamers.",
  "brand.hero.cta.primary": "See pricing",
  "brand.hero.cta.secondary": "Read the profile",

  "brand.problem.title": "Marketing to gamers means paying twice and reaching neither.",
  "brand.problem.subtitle":
    "A tournament sponsorship, then a social budget to promote the tournament — and still nothing where gamers actually spend the day.",
  "brand.problem.items":
    "Pay once for the event | Six figures, two days, and the value depends on whatever clips get cut afterwards.\n"
    + "Pay again for the attention | Those clips go to Meta and TikTok, and you buy the same audience a second time.\n"
    + "Still not where they live | Neither reaches Discord — where the squad is, between every match. No ads manager, no way in.",

  "brand.insight.title": "Discord is where gamers actually are.",
  "brand.insight.body":
    "A gamer might open TikTok. They might watch a tournament. But before and after both, they're on Discord — it's where the squad is and where the next match gets organised.\n\n"
    + "Every other audience this size has a Business Suite, targeting and a self-serve buy. Discord has none of it. That's not a gap in a media plan; it's the whole gaming audience behind a door with no handle.\n\n"
    + "Cluster is the handle.",
  "brand.insight.stat": "100%",
  "brand.insight.statLabel": "of gamers are on Discord",
  "brand.insight.stat2": "0",
  "brand.insight.stat2Label": "ads managers to buy it with",

  "brand.solution.title": "How to advertise on Discord, without asking anyone.",
  "brand.solution.subtitle":
    "Not banners bolted onto a chat app. Your brand inside the competition rather than beside it — buyable in an afternoon, measurable by Friday.",
  "brand.solution.items":
    "Sponsored challenges | Your name on the weekly competition for a game you pick. They were going to play anyway.\n"
    + "A slot on every card | Your creative on every image the bot draws, with your button under it. Swap it yourself, any time.\n"
    + "Branded trophies | Your logo on the trophy the winner keeps on their profile. Not seen — kept.\n"
    + "Numbers that mean something | Entrants, clicks, cost-per-entrant and eCPM, per week, with the servers it landed in named.",

  "brand.loop.title": "A three-sided platform",
  "brand.loop.subtitle":
    "Brands spend, gamers play, owners earn. No side works without the other two, which is what makes it run without us.",
  "brand.loop.items":
    "Brands buy | A month of challenges on a published rate card, with the reach stated before you spend.\n"
    + "Gamers play | One verified account, as many challenges as they like, a trophy that stays on their profile.\n"
    + "Owners earn | A share of the fee on every challenge that runs in their server. No sales team, no admin.\n"
    + "Cluster runs it | The bot posts it, scores it, announces it and pays out. Nobody operates anything.",

  "brand.prize.title": "Most of it isn't ad spend. It's prize money.",
  "brand.prize.body":
    "70% of what you pay goes to the players as prizes, on trophies carrying your logo. No setup fee, no admin fee, no agency. That's why the rest buys reach instead of overhead.",

  // ===== The Discord section: the server-owner pitch =====
  // The other side of the marketplace. Brands pay in; servers get paid out.
  "discord.badge": "ClusterBot for Discord",
  "discord.title": "Monetize your Discord server without selling anything.",
  "discord.subtitle":
    "Install the bot and your members get ranked profiles, live stats and weekly challenges with real prize money. Brands fund the prizes; you take a share of every challenge that runs here. Free forever, and it never reads a message.",
  "discord.cta.primary": "Add ClusterBot to your server",
  "discord.cta.secondary": "See who's running it",

  // The /discord-bot hero. Separate keys from the homepage band above because
  // it's a different pitch at a different length — the band is a teaser inside
  // someone else's page, this is the landing page an owner arrives on.
  //
  // These had no defaults, so the page fell through to strings hardcoded in the
  // JSX and kept saying the old thing after every other surface had moved.
  // `{threshold}` is substituted with the live unlock number, so the copy can
  // never quote a figure the product isn't using.
  "discord.hero.title": "Earn money from your Discord server.",
  "discord.hero.subtitle":
    "Weekly challenges with real prize money, run by a bot, funded by brands. Your members get ranked profiles and live stats from the games they already play. Link {threshold} gamers and you earn a share of every sponsored challenge here. Free forever, and it never reads a message.",

  // ===== The gamer-facing hero (still the entry point for players) =====
  "hero.badge": "Live stats from the games you already play",
  "hero.title.line1": "Every game.",
  "hero.title.line2": "One identity.",
  "hero.subtitle":
    "Your ranks, ratings and wins from every game on one profile. Enter as many challenges as you like on one account — you're playing anyway, and one win moves every board you're on. Real prize money, checked against the game's own API.",
  "hero.cta.primary": "Claim your profile",
  "hero.cta.secondary": "Explore leaderboards",
  "hero.image": "/assets/hero.png",
  "hero.banner.label": "The Cluster galaxy",
  "hero.banner.note": "Six worlds, one weekly challenge each. Tap a game to open its planet.",
  "section.challenges.title": "Live Challenges",
  "section.challenges.subtitle": "Join, play the game you were going to play, watch the board move. One account, as many as you like.",
  "section.games.title": "The Game Galaxy",
  "section.games.subtitle": "Every world we run — each with its own weekly challenge, leaderboards and community.",
  "section.leaderboards.title": "Leaderboards",
  "section.leaderboards.subtitle": "Live standings from verified, API-synced accounts.",
  "section.badges.title": "Badges forged in the void",
  "section.badges.subtitle": "Earned from linked accounts, rank thresholds, community reputation and challenge placements. The criteria are code.",
  "section.partners.title": "Trusted by",
  "section.cta.title": "Three sides, one network",
  "section.cta.subtitle": "Brands sponsor it. Owners host it and earn. Gamers play and win. Pick your side.",
  "section.cta.button": "Join the Cluster — it's free",
  "banner.arena": BANNER_ART.arena,
  "banner.games": BANNER_ART.games,
  "banner.profileDefault": BANNER_ART.profileDefault,
  "footer.tagline":
    "The media-buying and monetization layer for gaming communities. Advertise on Discord, monetize your server, or play and win.",
  "footer.brands.title": "For brands",
  "footer.servers.title": "For server owners",
  // Copy used everywhere a gamer shares their profile — the site's share button
  // and the bot's /cluster show:share. `{name}` and `{url}` are substituted.
  "share.profile.message": "Check out my profile on Cluster — and vote for me",
  // Platform logo (shown in the nav + footer), admin-editable with framing.
  "brand.logo": "/assets/logo.png",       // square letter-mark
  "brand.logo.zoom": "1",
  "brand.logo.x": "50",
  "brand.logo.y": "50",
  "brand.wordmark": "",                     // wide CLUSTER wordmark (empty = gradient text)
  "brand.wordmark.zoom": "1",               // wide wordmark scale multiplier
  "brand.nav.mode": "both",                 // mark | wordmark | both
  "brand.nav.planetsIcon": "",              // custom image for the nav "all planets" button
  "brand.nav.hidePlanets": "",              // "1" hides the "All planets" badge from the nav
  // The trophy marketplace, as a nav badge in the same family as the planets
  // badge. It was a bare 18px icon among the right-hand controls, which read as
  // a utility rather than a destination — CP is only worth playing for if the
  // place it spends looks like somewhere to go.
  "brand.nav.marketplaceIcon": "",          // custom image for the marketplace badge (empty = trophy glyph)
  "brand.nav.marketplaceLabel": "",         // tooltip/drawer label (empty = "Trophy marketplace")
  "brand.nav.marketplaceOrder": "after",    // "before" | "after" the planets badge
  "brand.footer.mode": "both",
  // Loading screen (rotating circle) — editable color + optional inner logo +
  // a rotating list of phrases (one per line) that cycles every second.
  "brand.loading.color": "#8b5cf6",
  "brand.loading.logo": "",
  "brand.loading.phrases": "Traversing the cluster…\nAligning the constellations…\nCharging warp coils…\nSyncing your galaxy…\nPolishing trophies…\nCounting Cluster Points…",
  // Seconds between loading phrases (admin-editable; 1–20).
  "brand.loading.interval": "3",
  // Gamified astronaut on the loading screen. Empty = hidden; defaults to the mascot.
  "brand.loading.astronaut": "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260718_155414_f0fa69a2-5889-449b-9eb0-b242a5b07aa2.png",
  // Loading-screen background art (empty = dark blur). Show the wordmark at the bottom.
  "brand.loading.bg": "",
  "brand.loading.wordmark": "1",
  // Orb size in px (72–200) — the whole orb is editable via these keys + color/logo.
  "brand.loading.orbSize": "80",
  // Floating quest orb icon (bottom-right). Empty = default CP coin.
  "brand.orb.icon": "",
  "brand.orb.color": "#8b5cf6",
  // Size of the floating quest orb in px (44–140). 0 hides it.
  "brand.orb.size": "72",
  // The second floating orb: "add ClusterBot to your server". Same controls as
  // the quest orb, and 0 hides it. Defaults to Discord's own blurple, because
  // the whole point of it is to be recognised as the Discord button.
  "brand.discordOrb.icon": "",
  "brand.discordOrb.color": "#5865f2",
  "brand.discordOrb.size": "72",
  // "You are here" marker image on the quest map. Empty = the gamified astronaut
  // (below), which faces the direction it's travelling. Set to override with a
  // single static marker image.
  "brand.quest.rocket": "",
  // Gamified astronaut marker — one consistent figure in four poses. The marker
  // uses left/right when moving toward the next milestone, front at the finish.
  "brand.quest.astronaut.front": "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260718_155414_f0fa69a2-5889-449b-9eb0-b242a5b07aa2.png",
  "brand.quest.astronaut.left": "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260718_160245_a37623dc-1afa-4be5-959d-024783ea12cc.png",
  "brand.quest.astronaut.right": "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260718_162543_ddcab2ca-0347-4f0b-84d7-920d967eab7a.png",
  "brand.quest.astronaut.back": "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260718_162547_f9ac9fc5-26d0-431a-8e59-969d53b3fe65.png",
  // Nav + footer background images, favicon (+ zoom).
  "brand.nav.bg": "",
  "brand.footer.bg": "",
  "brand.favicon": "",
  "brand.favicon.zoom": "1",
  // Connect/onboarding: comma-separated provider ids the admin has hidden.
  "connect.hidden": "",
  // Admin-editable roster of countries gamers can pick a flag from (JSON array of
  // {code,name}); empty = the built-in default roster (lib/flags.ts).
  "profile.countries": "",
  // RBAC: comma-separated admin areas delegated to the staff role (see lib/permissions).
  "staff.access": "",
  // The Cluster Points currency icon art (editable; defaults to the generated one).
  "brand.cpIcon": "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260717_223629_251d5972-a1bc-4e38-8724-1ea35bf10f18.png",
  // Quest-game panel art (Rules / Log / Guide / Missions screens) — generated
  // cosmic defaults, replaceable in Admin → Card backgrounds.
  "card.bg.quest_rules": "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260722_010231_915c66fd-4f71-4af9-9e89-b9e6abd8a395.png",
  "card.bg.quest_log": "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260722_010235_4e49d817-1dba-419a-81a4-482f6b2192a8.png",
  "card.bg.quest_guide": "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260722_010239_1deaec61-61f9-4f0e-86ce-f42342cd3b0c.png",
  "card.bg.quest_missions": "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260722_010244_4c9666d0-355d-4ad3-a8be-0c378eae0c9a.png",
};

// `platform_settings.value` is a jsonb column, and reading it back as a JS
// value cannot be trusted: the Postgres driver already parses jsonb, and the
// ORM then parses the result a second time. A stored string survives that only
// if it isn't itself valid JSON — so "Turn your Discord into a competition."
// comes back intact while "1234567890123456789" comes back as the NUMBER
// 1234567890123456800, silently precision-mangled and no longer a string.
//
// That quietly broke every numeric setting we store (a Discord server id, orb
// size, logo zoom): the value saved, then read back as a non-string and got
// discarded in favour of the default. So we never read the parsed value —
// `#>>'{}'` unwraps the jsonb to text in the database, which is exact for long
// ids and identical for ordinary copy.
const TEXT_VALUE = {
  key: schema.platformSettings.key,
  text: sql<string | null>`${schema.platformSettings.value}#>>'{}'`,
};

// Content is locale-aware: Arabic values live under a "<key>@ar" namespaced key
// and OVERLAY the English value when the active locale is Arabic (empty ar value
// falls back to English → the site is never blank while translation is ongoing).
// The locale is auto-resolved from the request cookie so callers don't change;
// pass `localeOverride` to force one (e.g. the admin translation editor).
/**
 * Every setting, once per request (B55.2).
 *
 * `getContent` was five separate queries on an ordinary page render —
 * `app/layout.tsx` twice, plus Nav, Footer and FloatingOrbs — and measurement
 * put `platform_settings` at the top of every surface: 30 reads on `/admin`,
 * **61 on the brand portal**, more than any other table by a wide margin.
 *
 * Wrapping `getContent` itself in `cache()` would have fixed almost nothing.
 * React's `cache()` keys on the ARGUMENTS, and every caller passes a different
 * list of keys — five calls, five key arrays, five cache entries, five queries.
 * The dedupe has to happen one level down, on a call that takes no arguments.
 *
 * So: read the whole table once and slice from it. `platform_settings` is site
 * chrome — branding, toggles, a few ids — measured at well under a thousand
 * rows, which is far cheaper to fetch once than to query five times over
 * `neon-http`, where every query is its own HTTPS round trip.
 */
const allSettings = cache(async (): Promise<Map<string, string>> => {
  try {
    const db = await getDb();
    const rows = await db.select(TEXT_VALUE).from(schema.platformSettings);
    return new Map(rows.map((r) => [r.key, r.text ?? ""]));
  } catch { return new Map(); }
});

export async function getContent(keys: string[], localeOverride?: "en" | "ar"): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = CONTENT_DEFAULTS[k] ?? "";
  let locale: "en" | "ar" = localeOverride ?? "en";
  if (!localeOverride) {
    try { const { getLocale } = await import("@/lib/i18n/server"); locale = await getLocale(); } catch { /* default en */ }
  }
  try {
    const map = await allSettings();
    for (const k of keys) {
      const base = map.get(k);
      if (typeof base === "string" && base) out[k] = base;
      if (locale === "ar") { const ar = map.get(`${k}@ar`); if (ar) out[k] = ar; }
    }
  } catch { /* defaults already applied */ }
  return out;
}

// Read the raw stored value for a key in a specific locale (no fallback) — used
// by the admin translation editor so it shows exactly what's saved.
export async function getRawContent(keys: string[], locale: "en" | "ar"): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const storeKeys = locale === "ar" ? keys.map((k) => `${k}@ar`) : keys;
  try {
    const db = await getDb();
    const rows = await db.select(TEXT_VALUE).from(schema.platformSettings)
      .where(inArray(schema.platformSettings.key, storeKeys));
    const map = new Map(rows.map((r) => [r.key, r.text ?? ""]));
    for (const k of keys) out[k] = map.get(locale === "ar" ? `${k}@ar` : k) ?? "";
  } catch { /* empty */ }
  return out;
}

export async function setContent(key: string, value: string, locale: "en" | "ar" = "en") {
  const storeKey = locale === "ar" ? `${key}@ar` : key;
  const db = await getDb();
  await db.insert(schema.platformSettings)
    .values({ key: storeKey, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.platformSettings.key, set: { value, updatedAt: new Date() } });
}
