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
  "brand.footer.mode": "both",
  // Loading screen (rotating circle) — editable color + optional inner logo.
  "brand.loading.color": "#8b5cf6",
  "brand.loading.logo": "",
  // Nav + footer background images, favicon (+ zoom).
  "brand.nav.bg": "",
  "brand.footer.bg": "",
  "brand.favicon": "",
  "brand.favicon.zoom": "1",
  // Connect/onboarding: comma-separated provider ids the admin has hidden.
  "connect.hidden": "",
};

export async function getContent(keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = CONTENT_DEFAULTS[k] ?? "";
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.platformSettings)
      .where(inArray(schema.platformSettings.key, keys));
    for (const row of rows) {
      if (typeof row.value === "string" && row.value) out[row.key] = row.value;
    }
  } catch { /* defaults already applied */ }
  return out;
}

export async function setContent(key: string, value: string) {
  const db = await getDb();
  await db.insert(schema.platformSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.platformSettings.key, set: { value, updatedAt: new Date() } });
}
