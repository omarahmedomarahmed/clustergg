import { NextRequest, NextResponse } from "next/server";
import { renderCard } from "@/lib/cards/render";
import { getOrRenderCard } from "@/lib/cards/cache";
import { profileCard, gameStatsCard, questCard, cpSummaryCard, leaderboardCard, planetCard, challengeCard, cardBg } from "@/lib/cards/data";
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
      case "planet":
        if (game) data = await planetCard(game);
        break;
      case "challenge":
        if (q.get("id")) data = await challengeCard(q.get("id")!);
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

  if (!data) return fallbackCard("This card had no data — link a game account to fill it in.");

  if (!fresh) {
    // Cache key = everything that identifies this card within its kind.
    const key = [slug, game, q.get("quest"), q.get("topic"), q.get("metric"), q.get("id")].filter(Boolean).join("|") || "default";
    const hit = await getOrRenderCard(kind, key, data).catch(() => null);
    if (hit) return NextResponse.redirect(hit.url, { status: 302, headers: { "x-card-cache": hit.cached ? "hit" : "miss" } });
  }

  // A render can still fail on something outside our control (a font, a
  // pathological string). Discord shows a broken-image box for any non-image
  // response, so this endpoint must always answer with a picture.
  try {
    return await renderCard(data);
  } catch {
    return fallbackCard("This card couldn't be drawn just now.");
  }
}

async function fallbackCard(subtitle: string) {
  const bg = await cardBg("bot_welcome").catch(() => ({ bgUrl: null, dim: 62 }));
  const data: CardData = {
    kind: "guide",
    title: "Nothing to show yet",
    subtitle,
    badge: "CLUSTER",
    steps: GUIDE_TOPICS["getting-started"].steps.slice(0, 3),
    footer: "clustergg.com",
    theme: { accent: "#8b5cf6", accent2: "#22d3ee", bgUrl: bg.bgUrl, dim: bg.dim },
  };
  try {
    return await renderCard(data);
  } catch {
    // Absolute last resort: art with no data at all still beats a 500.
    return renderCard({ ...data, theme: { accent: "#8b5cf6", accent2: "#22d3ee" } });
  }
}
