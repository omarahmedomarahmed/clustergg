import { NextRequest, NextResponse } from "next/server";
import { renderCard } from "@/lib/cards/render";
import { getOrRenderCard } from "@/lib/cards/cache";
import { profileCard, gameStatsCard, questCard, cpSummaryCard, leaderboardCard, cardBg } from "@/lib/cards/data";
import { guideCard, GUIDE_TOPICS } from "@/lib/cards/guides";
import type { CardData } from "@/lib/cards/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public PNG card renderer. One endpoint serves every "glorified snapshot" the
// Discord bot attaches AND doubles as OpenGraph art for shared links.
//   /api/card/profile?slug=nova
//   /api/card/game-stats?slug=nova&game=Valorant
//   /api/card/quest?slug=nova&quest=conquest
//   /api/card/cp?slug=nova
//   /api/card/leaderboard?game=Valorant
//   /api/card/guide?topic=getting-started
// Cards are public by design (they're meant to be shared) and contain only data
// already visible on the public profile.
//
// A rendered card is stored in Blob and reused until its underlying data
// changes, so repeat requests redirect to the hosted PNG instead of re-drawing
// it. Pass `?fresh=1` to bypass the cache (used by the admin guide preview).
export async function GET(req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const q = req.nextUrl.searchParams;
  const slug = q.get("slug");
  const game = q.get("game");
  const fresh = q.get("fresh") === "1";

  let data: CardData | null = null;
  try {
    switch (kind) {
      case "profile":
        if (slug) data = await profileCard(slug);
        break;
      case "game-stats":
        if (slug && game) data = await gameStatsCard(slug, game);
        break;
      case "quest":
        data = await questCard(slug, q.get("quest") ?? "");
        break;
      case "cp":
      case "cp-summary":
        if (slug) data = await cpSummaryCard(slug);
        break;
      case "leaderboard":
        if (game) data = await leaderboardCard(game, q.get("metric"));
        break;
      case "guide":
        data = await guideCard(q.get("topic") ?? "getting-started", q.get("quest"));
        break;
      default:
        return NextResponse.json({ error: "unknown card kind" }, { status: 404 });
    }
  } catch {
    data = null;
  }

  if (!data) {
    // Never 500 into a Discord attachment — render a branded fallback instead.
    const bg = await cardBg("bot_welcome").catch(() => ({ bgUrl: null, dim: 62 }));
    data = {
      kind: "guide",
      title: "Nothing to show yet",
      subtitle: "This card had no data — link a game account to fill it in.",
      badge: "CLUSTER",
      steps: GUIDE_TOPICS["getting-started"].steps.slice(0, 3),
      footer: "clustergg.com",
      theme: { accent: "#8b5cf6", accent2: "#22d3ee", bgUrl: bg.bgUrl, dim: bg.dim },
    };
    return renderCard(data); // never cache a fallback
  }

  if (!fresh) {
    // Cache key = everything that identifies this card within its kind.
    const key = [slug, game, q.get("quest"), q.get("topic"), q.get("metric")].filter(Boolean).join("|") || "default";
    const hit = await getOrRenderCard(kind, key, data).catch(() => null);
    if (hit) return NextResponse.redirect(hit.url, { status: 302, headers: { "x-card-cache": hit.cached ? "hit" : "miss" } });
  }

  return renderCard(data);
}
