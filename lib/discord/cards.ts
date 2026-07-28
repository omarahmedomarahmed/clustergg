import { AsyncLocalStorage } from "node:async_hooks";
import { getOrRenderCard } from "@/lib/cards/cache";
import { withCardAd, logCardAdImpression } from "@/lib/cards/ads";
import { profileCard, gameStatsCard, questCard, cpSummaryCard, leaderboardCard, planetCard, planetsCard, challengeCard, weekCard, worldCard } from "@/lib/cards/data";
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
  planet: (a) => planetCard(a.game),
  planets: () => planetsCard(),
  challenge: (a) => challengeCard(a.id),
  guide: (a) => guideCard(a.topic || "getting-started", a.quest || null),
  world: (a) => worldCard(a.game, a.entityKind, a.id, a.skin || null),
  week: (a) => weekCard({ weekKey: a.week || undefined, mode: a.mode === "result" ? "result" : a.mode === "race" ? "race" : undefined }),
};

// The always-works fallback: the public render route. Slower than a cached Blob
// URL but never wrong, and it is what makes the bot work before Blob is set up.
export function liveCardUrl(kind: string, args: Record<string, string>): string {
  const q = new URLSearchParams(Object.entries(args).filter(([, v]) => v));
  return `${siteUrl()}/api/card/${kind}?${q}`;
}

// Which server this interaction came from, for everything downstream.
//
// A card is requested from thirty places across the screen modules, almost none
// of which need to know about advertising — but every impression is worth more
// to a brand when it can be attributed to a server, and to a server owner when
// it counts toward what their community earned. Rather than thread a guild id
// through thirty signatures, the interaction handler declares it once for the
// request and anything rendered inside that request inherits it.
const guildScope = new AsyncLocalStorage<string | null>();

/** Declare the guild for the rest of this request. Called once, in `loadCtx`. */
export function setCardGuild(guildId: string | null | undefined): void {
  try { guildScope.enterWith(guildId ?? null); } catch { /* not fatal — impressions just lose the guild */ }
}

export function currentCardGuild(): string | null {
  return guildScope.getStore() ?? null;
}

// Prefer the cached Blob URL; fall back to the live route.
export async function cardRef(kind: string, args: Record<string, string>): Promise<CardRef> {
  const fallback = { url: liveCardUrl(kind, args), data: null };
  const load = loaders[kind];
  if (!load) return fallback;
  try {
    const raw = await load(args);
    if (!raw) return fallback;
    const key = Object.values(args).filter(Boolean).join("|") || "default";

    // The sponsor is chosen BEFORE the card is cached, and its id is part of
    // the cache key. Choosing it after would have meant one brand's version of
    // a card being served to everyone forever — the cache would hand back
    // whichever creative happened to be live the first time it was drawn.
    const { data, ad } = await withCardAd(raw, `${kind}|${key}`);
    const hit = await getOrRenderCard(kind, ad ? `${key}#${ad.campaignCreativeId}` : key, data);

    // Serving the card IS the impression: this is the moment the image goes
    // into a Discord message somebody is about to look at.
    if (ad) logCardAdImpression(ad.campaignCreativeId, { kind, guildId: currentCardGuild() });

    return { url: hit?.url ?? fallback.url, data };
  } catch {
    return fallback;
  }
}

// Discord embed colours are 24-bit integers, not CSS strings.
//
// Shorthand hex is accepted too: `#f0f` is a colour a gamer can genuinely have
// on their profile, and silently falling back to house purple made their card
// and its embed disagree.
export function embedColor(hex?: string | null): number {
  const raw = (hex ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return parseInt(raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2], 16);
  }
  if (/^[0-9a-f]{6,8}$/i.test(raw)) return parseInt(raw.slice(0, 6), 16);
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(hex ?? "");
  if (m) return (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]);
  return 0x8b5cf6;
}
