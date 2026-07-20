import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getContent } from "@/lib/cms";
import { resolveGame } from "@/lib/game-logos";
import CreativeStudio from "@/components/CreativeStudio";
import Icon from "@/components/Icon";
import type { StudioEntity, BrandAssets } from "@/lib/creative-templates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Creative studio" };

function whenLabel(d: Date | null): string {
  if (!d) return "";
  try { return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return ""; }
}

export default async function CreativeStudioPage() {
  const db = await getDb();
  const [games, challenges, quests, leaderboards, brand] = await Promise.all([
    db.select({ name: schema.games.name, slug: schema.games.slug, logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl, planetImageUrl: schema.games.planetImageUrl, planetBgUrl: schema.games.planetBgUrl }).from(schema.games).where(eq(schema.games.isActive, true)),
    db.select({ id: schema.challenges.id, title: schema.challenges.title, game: schema.challenges.game, coverUrl: schema.challenges.coverUrl, heroUrl: schema.challenges.heroUrl, endAt: schema.challenges.endAt, status: schema.challenges.status, prize: schema.challenges.prizeDescription }).from(schema.challenges).orderBy(desc(schema.challenges.startAt)).limit(80),
    db.select({ key: schema.quests.key, name: schema.quests.name, coverUrl: schema.quests.coverUrl, mapArtUrl: schema.quests.mapArtUrl, cardBgUrl: schema.quests.cardBgUrl, tagline: schema.quests.tagline }).from(schema.quests).limit(80),
    db.select({ id: schema.leaderboards.id, title: schema.leaderboards.title, game: schema.leaderboards.game }).from(schema.leaderboards).where(eq(schema.leaderboards.isActive, true)).limit(80),
    getContent(["brand.logo", "brand.wordmark", "brand.quest.astronaut.front", "footer.tagline"]),
  ]);

  const gameCover = (name: string) => resolveGame(games, name)?.coverUrl ?? resolveGame(games, name)?.planetBgUrl ?? null;

  const entities: StudioEntity[] = [
    ...challenges.map((c): StudioEntity => ({
      kind: "challenge", id: c.id, title: c.title, subtitle: c.game,
      cover: c.coverUrl || c.heroUrl || gameCover(c.game),
      meta: [c.status === "active" ? "Live" : "Ended", c.endAt ? `ends ${whenLabel(c.endAt)}` : "", c.prize ? `🏆 ${c.prize}` : ""].filter(Boolean).join(" · "),
    })),
    ...quests.map((q): StudioEntity => ({
      kind: "quest", id: q.key, title: q.name, subtitle: "Quest",
      cover: q.coverUrl || q.mapArtUrl || q.cardBgUrl || null,
      meta: (q.tagline || "").slice(0, 80),
    })),
    ...games.map((g): StudioEntity => ({
      kind: "game", id: g.slug, title: g.name, subtitle: "Planet",
      cover: g.coverUrl || g.planetBgUrl || g.planetImageUrl || null,
      meta: "Explore the planet",
    })),
    ...leaderboards.map((l): StudioEntity => ({
      kind: "leaderboard", id: l.id, title: l.title, subtitle: l.game,
      cover: gameCover(l.game), meta: `${l.game} leaderboard`,
    })),
  ];

  const brandAssets: BrandAssets = {
    logo: brand["brand.logo"] || "/assets/logo.png",
    wordmark: brand["brand.wordmark"] || "",
    astronaut: brand["brand.quest.astronaut.front"] || "",
    tagline: brand["footer.tagline"] || "Every game. One identity.",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2"><Icon name="spark" size={20} className="text-cyan-300" /> Social media creative studio</h1>
      <p className="text-sm text-muted mt-1 mb-6">
        Pick any challenge, quest, planet or leaderboard — it auto-fills a template with the right cover art, text and logo.
        Drag and edit any element, switch between a square post and a tall story, then download a ready-to-post PNG.
      </p>
      {entities.length === 0
        ? <div className="glass p-8 text-center text-sm text-muted">Create a challenge, quest or planet first — then it&apos;ll show up here to design a post about.</div>
        : <CreativeStudio entities={entities} brand={brandAssets} />}
    </div>
  );
}
