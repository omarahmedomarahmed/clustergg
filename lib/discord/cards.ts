import { getOrRenderCard } from "@/lib/cards/cache";
import { profileCard, gameStatsCard, questCard, cpSummaryCard, leaderboardCard } from "@/lib/cards/data";
import { guideCard } from "@/lib/cards/guides";
import { siteUrl } from "@/lib/discord/config";
import type { CardData } from "@/lib/cards/types";

// Turning a card into something Discord can show.
//
// Discord can display an image two ways: as an uploaded attachment, or as an
// embed `image.url` it fetches itself. We use the URL, because our cards are
// already stored in Blob at stable, content-hashed URLs — so Discord's CDN
// caches them, we upload nothing per command, and the 3-second interaction
// budget is spent on a database read instead of a multipart upload.

export type CardRef = { url: string; data: CardData | null };

const loaders: Record<string, (a: Record<string, string>) => Promise<CardData | null>> = {
  profile: (a) => profileCard(a.slug),
  "game-stats": (a) => gameStatsCard(a.slug, a.game),
  quest: (a) => questCard(a.slug || null, a.quest),
  cp: (a) => cpSummaryCard(a.slug),
  leaderboard: (a) => leaderboardCard(a.game, a.metric || null),
  guide: (a) => guideCard(a.topic || "getting-started", a.quest || null),
};

// The always-works fallback: the public render route. Slower than a cached Blob
// URL but never wrong, and it is what makes the bot work before Blob is set up.
export function liveCardUrl(kind: string, args: Record<string, string>): string {
  const q = new URLSearchParams(Object.entries(args).filter(([, v]) => v));
  return `${siteUrl()}/api/card/${kind}?${q}`;
}

// Prefer the cached Blob URL; fall back to the live route.
export async function cardRef(kind: string, args: Record<string, string>): Promise<CardRef> {
  const fallback = { url: liveCardUrl(kind, args), data: null };
  const load = loaders[kind];
  if (!load) return fallback;
  try {
    const data = await load(args);
    if (!data) return fallback;
    const key = Object.values(args).filter(Boolean).join("|") || "default";
    const hit = await getOrRenderCard(kind, key, data);
    return { url: hit?.url ?? fallback.url, data };
  } catch {
    return fallback;
  }
}

// Discord embed colours are 24-bit integers, not CSS strings.
export function embedColor(hex?: string | null): number {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  return m ? parseInt(m[1], 16) : 0x8b5cf6;
}
