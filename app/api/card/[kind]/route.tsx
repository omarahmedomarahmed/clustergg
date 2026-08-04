import { NextRequest, NextResponse } from "next/server";
import { renderCard } from "@/lib/cards/render";
import { toEmbeddable } from "@/lib/cards/img";
import { DEFAULT_LAYOUT } from "@/lib/cards/layout";
import { previewFixtures } from "@/lib/cards/preview";
import { getOrRenderCard } from "@/lib/cards/cache";
import { withCardAd, PREVIEW_AD } from "@/lib/cards/ads";
import { profileCard, gameStatsCard, questCard, cpSummaryCard, leaderboardCard, challengeStandingsCard, planetCard, planetsCard, challengeCard, weekCard, marketCard, worldCard, searchCard, cardBg } from "@/lib/cards/data";
import type { PreviewFixtures } from "@/lib/cards/preview";
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
        // `account` disambiguates two accounts on one game; without it the
        // gamer's first account on that game is used, as before.
        if (slug && game) data = await gameStatsCard(slug, game, q.get("account"));
        break;
      case "quest":
        data = await questCard(slug, q.get("quest") ?? fx?.questKey ?? "");
        break;
      case "cp":
      case "cp-summary":
        if (slug) data = await cpSummaryCard(slug);
        break;
      case "leaderboard": {
        // Scoped to a challenge when one is named — that is the challenge's own
        // standings, which is a different list from the game's lifetime board.
        const forChallenge = q.get("challenge");
        if (forChallenge) data = await challengeStandingsCard(forChallenge);
        else if (game) data = await leaderboardCard(game, q.get("metric"));
        break;
      }
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
      case "market":
        // The shelf is per-gamer: what a viewer can afford is the whole point,
        // so an anonymous render shows the shop with a zero balance rather than
        // somebody else's.
        data = await marketCard({ userId: q.get("gamer") });
        break;
      case "week":
        data = await weekCard({
          weekKey: q.get("week") ?? undefined,
          mode: q.get("mode") === "result" ? "result" : q.get("mode") === "race" ? "race" : undefined,
        });
        break;
      // The two kinds the studio could edit but never see. `world` and `search`
      // are in LAYOUT_KINDS — an admin could drag their furniture and change
      // their sections — and this route had no case for either, so the preview
      // underneath the editor was the "no data" fallback for both. Editing a
      // card you cannot look at is not editing.
      case "world": {
        const w = q.get("entity")
          ? { game: game ?? "", kind: q.get("entityKind") ?? "champion", id: q.get("entity")! }
          : fx?.world;
        if (w?.game && w.id) data = await worldCard(w.game, w.kind, w.id, q.get("skin"));
        break;
      }
      case "search":
        data = await searchCard(q.get("q") ?? "nova", await searchPreviewRows(fx));
        break;
      default:
        return NextResponse.json({ error: "unknown card kind" }, { status: 404 });
    }
  } catch {
    data = null;
  }

  if (!data) return fallbackCard("This card had no data — link a game account to fill it in.");

  // The sponsor for this render, chosen before the cache is consulted so each
  // brand's version of a card is stored separately. No impression is counted
  // here: this route is also the OpenGraph image for shared links, and a
  // crawler fetching a preview is not a gamer looking at a card. Impressions
  // are counted where a card is actually served into a message.
  const key = [slug, game, q.get("quest"), q.get("topic"), q.get("metric"), q.get("id"), q.get("week"), q.get("mode")].filter(Boolean).join("|") || "default";
  const picked = await withCardAd(data, `${kind}|${key}`);
  data = picked.data;
  // The layout editor always has a box to drag, even before anything is sold.
  if (!picked.ad && fx) data = { ...data, theme: { ...data.theme, ad: PREVIEW_AD } };

  // `?debug=1` answers "why doesn't my art show?" in a browser, without a
  // terminal and without guessing. It reports which source the background came
  // from and whether it actually resolved into bytes the renderer can draw —
  // those are different failures with the same symptom.
  if (q.get("debug") === "1") return NextResponse.json(await explain(data));

  // `?json=1` — the resolved card, as data.
  //
  // The layout editor draws each of a card's sections as its own box on the
  // canvas, and a box labelled "Standings" with nothing in it is a diagram.
  // Showing what that section will ACTUALLY say is the difference between
  // arranging rectangles and laying out a card, so the editor asks for the same
  // object the renderer is about to draw.
  //
  // No new exposure: every field here is already on the PNG this same URL
  // serves to anyone, and the PNG is designed to be reposted.
  if (q.get("json") === "1") {
    return NextResponse.json(data, {
      headers: { "cache-control": "no-store" },
    });
  }

  if (!fresh) {
    // Cache key = everything that identifies this card within its kind, plus
    // which creative is on it.
    const hit = await getOrRenderCard(kind, picked.ad ? `${key}#${picked.ad.campaignCreativeId}` : key, data).catch(() => null);
    if (hit) {
      return NextResponse.redirect(hit.url, {
        status: 302,
        headers: {
          "x-card-cache": hit.cached ? "hit" : "miss",
          // Let the CDN answer the redirect. Discord re-fetches an embed image
          // every time a message is scrolled past, and every one of those was
          // a function invocation resolving the same card to the same Blob URL.
          // Short TTL because the card's DATA can change (votes, standings);
          // stale-while-revalidate means nobody ever waits for the refresh.
          ...CARD_CACHE,
        },
      });
    }
  }

  // A render can still fail on something outside our control (a font, a
  // pathological string). Discord shows a broken-image box for any non-image
  // response, so this endpoint must always answer with a picture.
  try {
    const res = await renderCard(data);
    // The rendered-inline path (no Blob configured) is the expensive one — it
    // redraws the PNG per request — so it wants caching most of all.
    for (const [k, v] of Object.entries(CARD_CACHE)) res.headers.set(k, v);
    return res;
  } catch {
    return fallbackCard("This card couldn't be drawn just now.");
  }
}

// 5 minutes fresh at the CDN, a day of serving stale while it refreshes behind
// the scenes. `fresh=1` (the admin preview) skips this path entirely.
const CARD_CACHE = {
  "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
} as const;

// The "did you mean" card, previewed against things that actually exist.
//
// In production this card is built from a live ambiguous query, so its rows are
// whatever matched. For the studio that isn't reachable — there's no query — so
// the preview shows the real fixtures the platform already resolved: a gamer, a
// game, a champion. Three rows of true things beats six rows of lorem.
async function searchPreviewRows(fx: PreviewFixtures | null) {
  return [
    fx?.slug ? { label: fx.slug, sub: `clustergg.com/u/${fx.slug}`, kind: "gamer" } : null,
    fx?.game ? { label: fx.game, sub: "Game planet — challenges and boards", kind: "game" } : null,
    fx?.world ? { label: fx.world.id, sub: `${fx.world.kind} · ${fx.world.game}`, kind: fx.world.kind } : null,
  ].filter((r): r is { label: string; sub: string; kind: string } => r !== null);
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
