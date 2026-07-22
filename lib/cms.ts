import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { BANNER_ART } from "@/lib/assets";

// Lightweight CMS: editable site content lives in platform_settings as
// key → string. Every consumer supplies a default so missing keys never break.

export const CONTENT_DEFAULTS: Record<string, string> = {
  "hero.badge": "Live stat sync across real game networks",
  "hero.title.line1": "Every game.",
  "hero.title.line2": "One identity.",
  "hero.subtitle":
    "Cluster pulls your ranks, ratings and wins from every game you play into one shareable cosmic profile. Compete in live challenges, earn badges forged from real API data, and climb leaderboards that actually mean something.",
  "hero.cta.primary": "Claim your profile",
  "hero.cta.secondary": "Explore leaderboards",
  "hero.image": "/assets/hero.png",
  "section.challenges.title": "Live Challenges",
  "section.challenges.subtitle": "Real API data. Real stakes. Join, play your game, and watch the standings move.",
  "section.games.title": "The Game Galaxy",
  "section.games.subtitle": "Every world we track — pick yours and claim your standing.",
  "section.leaderboards.title": "Leaderboards",
  "section.leaderboards.subtitle": "Live standings from verified, API-synced accounts.",
  "section.badges.title": "Badges forged in the void",
  "section.badges.subtitle": "Earned from linked accounts, rank thresholds, community reputation and challenge placements. The criteria are code.",
  "section.partners.title": "Trusted by",
  "section.cta.title": "Your gaming legacy, one link",
  "section.cta.subtitle": "clustergg.com/u/you — the only link a gamer needs in their bio.",
  "section.cta.button": "Join the Cluster — it's free",
  "banner.arena": BANNER_ART.arena,
  "banner.games": BANNER_ART.games,
  "banner.profileDefault": BANNER_ART.profileDefault,
  "footer.tagline": "Every game. One identity. Link your accounts, flex your ranks, and climb the galaxy.",
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
  // Size of the floating quest orb in px (44–120).
  "brand.orb.size": "56",
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
    const rows = await db.select().from(schema.platformSettings)
      .where(inArray(schema.platformSettings.key, fetchKeys));
    const map = new Map(rows.map((r) => [r.key, typeof r.value === "string" ? r.value : ""]));
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
    const rows = await db.select().from(schema.platformSettings)
      .where(inArray(schema.platformSettings.key, storeKeys));
    const map = new Map(rows.map((r) => [r.key, typeof r.value === "string" ? r.value : ""]));
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
