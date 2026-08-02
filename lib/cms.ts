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
  "brand.hero.badge": "B2B SaaS · gaming marketing",
  "brand.hero.title": "Gamers live on Discord.",
  "brand.hero.title2": "Now you can buy it.",
  "brand.hero.subtitle":
    "Cluster is the media-buying and monetization platform for Discord gaming communities. Brands sponsor gameplay instead of content, server owners earn from the audience they built, and gamers play for the chance to win. Sponsoring a challenge isn't ad spend — it's putting your brand inside a gamer's home and paying them to play.",
  "brand.hero.cta.primary": "See pricing",
  "brand.hero.cta.secondary": "Read the profile",

  "brand.problem.title": "Brands spend a lot to reach gamers. The system is broken.",
  "brand.problem.subtitle":
    "A tournament sponsorship, then a social budget to promote the tournament. Brands pay twice — and still aren't advertising where gamers spend most of their time.",
  "brand.problem.items":
    "Pay once for the event | An esports sponsorship costs six figures and lasts one or two days. Much of the value depends on whatever content gets cut afterwards, and the ROI is hard to measure while it's happening.\n"
    + "Pay again for the attention | Then the clips go to Meta and TikTok and you buy the same audience a second time — a gamer on their phone in the break between two matches, scrolling past on the way back to the lobby.\n"
    + "Still not where they live | Neither purchase reaches Discord, where a gamer starts the day, returns between matches and ends the night. There's no ads manager there, so until now there was no way to buy it.",

  "brand.insight.title": "Gamers live on Discord.",
  "brand.insight.body":
    "A gamer may open TikTok. A gamer may open Instagram. A gamer may go to a weekend event. But before that, they're on Discord — and after it, they go back to Discord. It's where the squad is, where the match gets organised, and where the argument about the last game happens.\n\n"
    + "Discord is home. And unlike every other place an audience this size gathers, there's no Business Suite, no targeting, no pixel and no self-serve buy. That isn't a gap in a media plan — it's the entire gaming audience sitting behind a door with no handle.\n\n"
    + "Cluster is the handle. We turn Discord from an unstructured community space into a real media-buying and monetization platform for gaming.",
  "brand.insight.stat": "100%",
  "brand.insight.statLabel": "of gamers are on Discord",
  "brand.insight.stat2": "0",
  "brand.insight.stat2Label": "ads managers to buy it with",

  "brand.solution.title": "Cluster unlocks Discord advertising, in a structured way.",
  "brand.solution.subtitle":
    "Not a banner network bolted onto a chat app. A media-buying layer over the communities gamers already live in — buyable, measurable and repeatable, with the brand inside the competition rather than next to it.",
  "brand.solution.items":
    "Sponsored challenges | Your name on the weekly competition for a game you choose. The community was going to enter it anyway — now it carries your brand.\n"
    + "In-bot ad placements | Your creative on every card the bot renders, in every opted-in server, with your click button underneath it. Swap it yourself from the portal, any time.\n"
    + "Branded trophies | Your logo on the trophy the winner keeps on their profile. The brand isn't seen — it becomes part of the win.\n"
    + "Trackable analytics | Impressions, clicks, entrants, standings and ROAS, per challenge and per community. Structured gamer attention, not vague awareness.",

  "brand.loop.title": "A three-sided platform",
  "brand.loop.subtitle":
    "Brands spend. Gamers engage. Server owners earn. Cluster takes platform revenue — and no side works without the other two, which is what makes the loop run on its own.",
  "brand.loop.items":
    "Brands buy | Sponsored challenges and placements on a published rate card, bought for a month at a time, with reach and targeting stated before you spend.\n"
    + "Gamers play | They link a verified account, enter for the chance to win, and keep a trophy carrying your logo on the profile they share.\n"
    + "Owners earn | The community that hosted it takes a share of the platform fee. No sales team, no admin burden, no seeding.\n"
    + "Cluster runs it | The bot creates, posts, scores, announces and pays out. Every week, in every server, with nobody operating anything.",

  "brand.prize.title": "This isn't ad spend. You're paying gamers to play.",
  "brand.prize.body":
    "70% of what you pay for a challenge is prize money. It goes to three players as trophies carrying your logo, and Cluster funds and pays every one. No setup fees, no administration fees, no staff, no operations — that's the magic of Cluster as a product, and it's why the rest of your money buys reach instead of overhead.",

  // ===== The Discord section: the server-owner pitch =====
  // The other side of the marketplace. Brands pay in; servers get paid out.
  "discord.badge": "ClusterBot for Discord",
  "discord.title": "Your community is media. Get paid like it.",
  "discord.subtitle":
    "Install the bot and your members get ranked profiles, live stats from the games they already play, and challenges with real prize money — without leaving your server. Link 500 gamers and brands start sponsoring challenges here: your members win the prizes, and you take a share of the platform fee. Free forever, and it never reads a message.",
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
  "discord.hero.title": "Your community is media. Get paid like it.",
  "discord.hero.subtitle":
    "Your members get ranked profiles and live stats from the games they already play, plus weekly challenges with real prize money — without leaving your server. Link {threshold} gamers and brands start sponsoring challenges here: your members win the prizes, and you take a share of the platform fee on every one. Free forever, and it never reads a message.",

  // ===== The gamer-facing hero (still the entry point for players) =====
  "hero.badge": "Live stat sync across real game networks",
  "hero.title.line1": "Every game.",
  "hero.title.line2": "One identity.",
  "hero.subtitle":
    "Cluster pulls your ranks, ratings and wins from every game you play into one shareable profile. Enter sponsored challenges for the chance to win real money, earn trophies verified against the game's own API, and climb leaderboards that actually mean something. You don't sit through the ads here — you play them.",
  "hero.cta.primary": "Claim your profile",
  "hero.cta.secondary": "Explore leaderboards",
  "hero.image": "/assets/hero.png",
  "hero.banner.label": "The Cluster galaxy",
  "hero.banner.note": "Six worlds, one weekly challenge each. Tap a game to open its planet.",
  "section.challenges.title": "Live Challenges",
  "section.challenges.subtitle": "Real API data. Real money. Join, play your game, and watch the standings move.",
  "section.games.title": "The Game Galaxy",
  "section.games.subtitle": "Every world we run — each with its own weekly challenge, leaderboards and community.",
  "section.leaderboards.title": "Leaderboards",
  "section.leaderboards.subtitle": "Live standings from verified, API-synced accounts.",
  "section.badges.title": "Badges forged in the void",
  "section.badges.subtitle": "Earned from linked accounts, rank thresholds, community reputation and challenge placements. The criteria are code.",
  "section.partners.title": "Trusted by",
  "section.cta.title": "Three sides, one network",
  "section.cta.subtitle": "Brands sponsor the challenge. Server owners host it and earn. Gamers play and win. Pick your side.",
  "section.cta.button": "Join the Cluster — it's free",
  "banner.arena": BANNER_ART.arena,
  "banner.games": BANNER_ART.games,
  "banner.profileDefault": BANNER_ART.profileDefault,
  "footer.tagline":
    "The media-buying and monetization platform for Discord gaming communities. Brands reach gamers where they really are, server owners earn from the audience they built, and gamers play, win and share.",
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
export async function getContent(keys: string[], localeOverride?: "en" | "ar"): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = CONTENT_DEFAULTS[k] ?? "";
  let locale: "en" | "ar" = localeOverride ?? "en";
  if (!localeOverride) {
    try { const { getLocale } = await import("@/lib/i18n/server"); locale = await getLocale(); } catch { /* default en */ }
  }
  const fetchKeys = locale === "ar" ? [...keys, ...keys.map((k) => `${k}@ar`)] : keys;
  try {
    const db = await getDb();
    const rows = await db.select(TEXT_VALUE).from(schema.platformSettings)
      .where(inArray(schema.platformSettings.key, fetchKeys));
    const map = new Map(rows.map((r) => [r.key, r.text ?? ""]));
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
