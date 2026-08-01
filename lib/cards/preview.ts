import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

// A real card of every kind, for the admin layout editor.
//
// The editor is worthless previewing an invented card: the whole question it
// answers is "does my art survive a real headline, a real trophy stack, eight
// real rows". So a preview resolves the same fixtures the site would — a gamer
// who actually customised their profile, an active challenge, a game we sync —
// and renders that. Nothing here invents data; when the platform is empty the
// card falls back to the same "nothing to show yet" card everyone else gets.

/** The URL the editor points its preview at. Always renders fresh. */
export function previewUrlFor(kind: string): string {
  return `/api/card/${encodeURIComponent(kind)}?preview=1&fresh=1`;
}

export type PreviewFixtures = {
  slug: string | null;
  game: string | null;
  questKey: string | null;
  challengeId: string | null;
  /**
   * A real champion / agent / weapon from a real game catalogue.
   *
   * The world card is the one with a splash panel, ability icons and a name of
   * unpredictable length, so previewing it against an invented entity would
   * check none of the things it exists to check.
   */
  world: { game: string; kind: string; id: string } | null;
};

let memo: { at: number; value: PreviewFixtures } | null = null;
const TTL = 60_000;

export async function previewFixtures(): Promise<PreviewFixtures> {
  if (memo && Date.now() - memo.at < TTL) return memo.value;
  let value: PreviewFixtures = { slug: null, game: null, questKey: null, challengeId: null, world: null };
  try {
    const db = await getDb();
    const [profiles, games, quests, challenges] = await Promise.all([
      // A profile with a banner shows the card doing the hard thing — text over
      // a photograph — which is exactly what the layout is being tuned for.
      db.select({ slug: schema.users.slug, banner: schema.users.bannerUrl })
        .from(schema.users).orderBy(desc(schema.users.voteCount), desc(schema.users.profileViews)).limit(8),
      // Every active game, not the first one: most games have no world
      // catalogue at all (there are no Chess champions), and the world card's
      // preview needs one that does. The search below stops at the first hit.
      db.select({ name: schema.games.name }).from(schema.games)
        .where(eq(schema.games.isActive, true)).orderBy(schema.games.sortOrder).limit(24),
      db.select({ key: schema.quests.key }).from(schema.quests).limit(1),
      db.select({ id: schema.challenges.id }).from(schema.challenges)
        .orderBy(desc(schema.challenges.startAt)).limit(1),
    ]);
    value = {
      slug: (profiles.find((p) => p.banner) ?? profiles[0])?.slug ?? null,
      game: games[0]?.name ?? null,
      questKey: quests[0]?.key ?? null,
      challengeId: challenges[0]?.id ?? null,
      world: await firstEntity(games.map((g) => g.name)),
    };
  } catch { /* an empty platform previews the fallback card, which is correct */ }
  memo = { at: Date.now(), value };
  return value;
}

// The first entity of the first game that has a catalogue. Prefers a champion
// or agent over a weapon or a map: those are the ones with ability icons and a
// splash, which is the whole of what the world card's layout has to survive.
async function firstEntity(games: string[]): Promise<PreviewFixtures["world"]> {
  const { getCachedEntityList } = await import("@/lib/game-world-cache");
  for (const game of games) {
    try {
      const list = await getCachedEntityList(game);
      const pick = list.find((e) => ["champion", "agent", "legend", "hero"].includes(e.kind)) ?? list[0];
      if (pick) return { game, kind: pick.kind, id: pick.id };
    } catch { /* no catalogue for this game — try the next */ }
  }
  return null;
}
