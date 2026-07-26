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
};

let memo: { at: number; value: PreviewFixtures } | null = null;
const TTL = 60_000;

export async function previewFixtures(): Promise<PreviewFixtures> {
  if (memo && Date.now() - memo.at < TTL) return memo.value;
  let value: PreviewFixtures = { slug: null, game: null, questKey: null, challengeId: null };
  try {
    const db = await getDb();
    const [profiles, games, quests, challenges] = await Promise.all([
      // A profile with a banner shows the card doing the hard thing — text over
      // a photograph — which is exactly what the layout is being tuned for.
      db.select({ slug: schema.users.slug, banner: schema.users.bannerUrl })
        .from(schema.users).orderBy(desc(schema.users.voteCount), desc(schema.users.profileViews)).limit(8),
      db.select({ name: schema.games.name }).from(schema.games).where(eq(schema.games.isActive, true)).limit(1),
      db.select({ key: schema.quests.key }).from(schema.quests).limit(1),
      db.select({ id: schema.challenges.id }).from(schema.challenges)
        .orderBy(desc(schema.challenges.startAt)).limit(1),
    ]);
    value = {
      slug: (profiles.find((p) => p.banner) ?? profiles[0])?.slug ?? null,
      game: games[0]?.name ?? null,
      questKey: quests[0]?.key ?? null,
      challengeId: challenges[0]?.id ?? null,
    };
  } catch { /* an empty platform previews the fallback card, which is correct */ }
  memo = { at: Date.now(), value };
  return value;
}
