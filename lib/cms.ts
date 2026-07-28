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
  // The argument the whole public site now makes, in the order it makes it:
  // reaching gamers is expensive and inaccurate → because gamers are on Discord
  // → and Discord has no ads manager → so we built the way in → and the ad unit
  // is a sponsored community challenge.
  //
  // Card lists are "Heading | body" per line (see `pairs()` in lib/pricing.ts),
  // so an admin edits one textarea instead of twelve fields.
  "brand.hero.badge": "For brands, agencies and publishers",
  "brand.hero.title": "Every gamer is on Discord.",
  "brand.hero.title2": "Nobody can advertise there.",
  "brand.hero.subtitle":
    "Cluster is a gaming platform and a Discord bot. We connect brands to gaming communities inside the one place every gamer actually is — and the ad unit isn't a banner, it's a weekly challenge with your name on it.",
  "brand.hero.cta.primary": "See pricing",
  "brand.hero.cta.secondary": "How it works",

  "brand.problem.title": "Reaching gamers costs a fortune. Most of it misses.",
  "brand.problem.subtitle":
    "There are three ways to buy a gamer's attention today. Every one of them makes you pay for the people who aren't gamers.",
  "brand.problem.items":
    "Sponsor an esports event | Six figures, one weekend, one city. You reach the fans who could afford a ticket — and the stream viewers who muted your bumper.\n"
    + "Buy Meta and TikTok ads | You're paying for the phone break between two matches. They scroll past you on the way back to the lobby, and you paid for every impression that missed.\n"
    + "Find a big Discord server yourself | Only if you have the contacts. Big servers charge premium because you came to them — that's how they pay their moderators — and there's no rate card, no targeting, and no reporting.",

  "brand.insight.title": "Gamers don't live where you're buying.",
  "brand.insight.body":
    "A gamer might have a Facebook account. Might have TikTok. Might make it to an event if the ticket is affordable. But every single one of them has Discord — it's where the squad is, where the match gets organised, and where the argument about the last game happens. They're on Discord before they pick up their phone, and back on Discord the second they put it down.\n\n"
    + "Discord has no ads manager. No Business Suite, no targeting, no pixel, no self-serve buy. That isn't a gap in your media plan — it's the entire gaming audience sitting behind a door with no handle.",
  "brand.insight.stat": "100%",
  "brand.insight.statLabel": "of gamers have Discord",
  "brand.insight.stat2": "0",
  "brand.insight.stat2Label": "ways to buy ads on it",

  "brand.solution.title": "We built the handle.",
  "brand.solution.subtitle":
    "Cluster is Discord-native. The bot lives inside servers gamers already run, verifies who plays what against each game's own API, and a web app plus a loyalty loop keeps them coming back, inviting friends and sharing their profiles. That's what makes advertising to them work — they're engaged, identified and there on purpose.",
  "brand.solution.items":
    "Discord-native | The bot works inside the server. No app to install, no link to click, no audience to migrate. It never reads a message.\n"
    + "Verified, not claimed | Every account is read from the game's official API. Nothing is self-reported, so the audience can be described precisely instead of estimated.\n"
    + "A loyalty loop, not a campaign | Cluster Points, quests, trophies and a weekly profile competition bring gamers back tomorrow. Attention you rent ends; attention that compounds is what you're buying.\n"
    + "The ad unit gamers want | A sponsored community challenge, four a month per game, carrying your name — entered on purpose, not scrolled past.",

  "brand.loop.title": "Why they keep coming back",
  "brand.loop.subtitle": "The loop is the product. It's also the reason a placement here is worth more than an impression anywhere else.",
  "brand.loop.items":
    "Link | A gamer links an account and gets a ranked profile, verified against the game's own API.\n"
    + "Compete | Weekly challenges with real money on them. Every week, every game.\n"
    + "Share | Profiles get shared, voted on and argued over. Sunday's Best Profile is live-streamed and clipped.\n"
    + "Return | Cluster Points, quests and trophies bring them back tomorrow — which is exactly what makes your placement worth buying.",

  "brand.prize.title": "Real money, every week, in every game.",
  "brand.prize.body":
    "70% of what you pay for a challenge is the prize. It goes to three players as trophies carrying your brand, and Cluster runs the payout. You buy the competition and the name on it — not the admin, and not the risk of a prize going unpaid.",

  // ===== The Discord section: the server-owner pitch =====
  // The other side of the marketplace. Brands pay in; servers get paid out.
  "discord.badge": "ClusterBot for Discord",
  "discord.title": "Your community is an audience. Get paid like one.",
  "discord.subtitle":
    "Install the bot and your members get ranked profiles, live stats from the games they already play, and challenges with real prize money — without leaving your server. Link 500 gamers and brands start sponsoring challenges here — with the prize money won by your members. Free, forever, and it never reads a message.",
  "discord.cta.primary": "Add ClusterBot to your server",
  "discord.cta.secondary": "See who's running it",

  // ===== The gamer-facing hero (still the entry point for players) =====
  "hero.badge": "Live stat sync across real game networks",
  "hero.title.line1": "Every game.",
  "hero.title.line2": "One identity.",
  "hero.subtitle":
    "Cluster pulls your ranks, ratings and wins from every game you play into one shareable profile. Compete in weekly challenges with real prize money, earn trophies verified against the game's own API, and climb leaderboards that actually mean something.",
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
  "section.cta.title": "Two ways in, one network",
  "section.cta.subtitle": "Brands buy the challenge. Servers host it. Gamers win the money. Pick your side.",
  "section.cta.button": "Join the Cluster — it's free",
  "banner.arena": BANNER_ART.arena,
  "banner.games": BANNER_ART.games,
  "banner.profileDefault": BANNER_ART.profileDefault,
  "footer.tagline":
    "The gaming platform and Discord bot that connects brands to gaming communities. Gamers link their accounts and compete for real money; servers get paid for the audience they built; brands finally have a way in.",
  "footer.brands.title": "For brands",
  "footer.servers.title": "For server owners",
  // Copy used everywhere a gamer shares their profile — the site's share button
  // and the bot's /cluster share. `{name}` and `{url}` are substituted.
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
