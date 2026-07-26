import { NextRequest, NextResponse } from "next/server";
import { renderCard } from "@/lib/cards/render";
import { toEmbeddable } from "@/lib/cards/img";
import { DEFAULT_LAYOUT } from "@/lib/cards/layout";
import { previewFixtures } from "@/lib/cards/preview";
import { getOrRenderCard } from "@/lib/cards/cache";
import { profileCard, gameStatsCard, questCard, cpSummaryCard, leaderboardCard, planetCard, planetsCard, challengeCard, cardBg } from "@/lib/cards/data";
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
  const fresh = q.get("fresh") === "1";
  // `?preview=1` fills in whatever identifiers weren't given from real platform
  // data, so the admin layout editor can ask for "a challenge card" without
  // knowing which challenge. Read-only, and every card it produces is public.
  const fx = q.get("preview") === "1" ? await previewFixtures() : null;
  const slug = q.get("slug") ?? fx?.slug ?? null;
  const game = q.get("game") ?? fx?.game ?? null;

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
        data = await questCard(slug, q.get("quest") ?? fx?.questKey ?? "");
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
      case "planets":
        data = await planetsCard();
        break;
      case "challenge": {
        const id = q.get("id") ?? fx?.challengeId;
        if (id) data = await challengeCard(id);
        break;
      }
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

  // `?debug=1` answers "why doesn't my art show?" in a browser, without a
  // terminal and without guessing. It reports which source the background came
  // from and whether it actually resolved into bytes the renderer can draw —
  // those are different failures with the same symptom.
  if (q.get("debug") === "1") return NextResponse.json(await explain(data));

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

async function explain(data: CardData) {
  const src = data.theme.bgUrl ?? null;
  const started = Date.now();
  const resolved = await toEmbeddable(src);
  return {
    kind: data.kind,
    background: {
      configured: !!src,
      source: !src ? "none"
        : src.startsWith("data:") ? `inline ${src.slice(5, src.indexOf(";"))} (${src.length.toLocaleString()} chars)`
          : src.slice(0, 120),
      resolved: !!resolved,
      resolvedAs: resolved ? resolved.slice(5, resolved.indexOf(";")) : null,
      resolvedBytes: resolved ? Math.round((resolved.length * 3) / 4) : 0,
      tookMs: Date.now() - started,
      why: !src
        ? "No background is set for this card. For a profile, set one in the profile builder under Page background image."
        : resolved
          ? "The background resolved and is drawn on the card."
          : "The background is set but could NOT be turned into drawable bytes — it timed out, was unreachable, or is a format we can't decode.",
    },
    accent: data.theme.accent,
    accent2: data.theme.accent2,
    dim: data.theme.layout?.dim ?? DEFAULT_LAYOUT.dim,
  };
}

async function fallbackCard(subtitle: string) {
  const bg = await cardBg("bot_welcome").catch(() => ({ bgUrl: null }));
  const data: CardData = {
    kind: "guide",
    title: "Nothing to show yet",
    subtitle,
    badge: "CLUSTER",
    steps: GUIDE_TOPICS["getting-started"].steps.slice(0, 3),
    footer: "clustergg.com",
    theme: { accent: "#8b5cf6", accent2: "#22d3ee", bgUrl: bg.bgUrl },
  };
  try {
    return await renderCard(data);
  } catch {
    // Absolute last resort: art with no data at all still beats a 500.
    return renderCard({ ...data, theme: { accent: "#8b5cf6", accent2: "#22d3ee" } });
  }
}
