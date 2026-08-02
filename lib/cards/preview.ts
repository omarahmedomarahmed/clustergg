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
export function previewUrlFor(kind: string, params?: Record<string, string>): string {
  const q = new URLSearchParams({ preview: "1", fresh: "1", ...(params ?? {}) });
  return `/api/card/${encodeURIComponent(kind)}?${q.toString()}`;
}

/**
 * Several real cards of one kind, to tune a layout against.
 *
 * One fixture is not enough and never was. A layout that reads beautifully over
 * one gamer's dark space wallpaper is illegible over another's white anime
 * splash, and the only way to find that out was to ship it. So the editor gets
 * a row of real samples to switch between — deliberately spanning cards WITH
 * background art and cards without, because "no art" is the case that exposes
 * every assumption about contrast.
 *
 * Everything here is a real row from the database. Nothing is invented: a
 * sample that isn't a card somebody could actually receive tests nothing.
 */
export type CardSample = {
  /** Stable key for the chip and for React. */
  id: string;
  label: string;
  /** What the sample is useful for — "has cover art", "no art", "long name". */
  note: string;
  /** Query params handed to the card route. */
  params: Record<string, string>;
};

export async function previewSamples(kind: string): Promise<CardSample[]> {
  try {
    const db = await getDb();
    switch (kind) {
      case "profile":
      case "cp-summary":
      case "cp": {
        // A gamer's own background lives inside their `theme` document, not in
        // a column of its own — so it has to be read out rather than selected.
        const raw = await db.select({
          slug: schema.users.slug, name: schema.users.displayName,
          banner: schema.users.bannerUrl, theme: schema.users.theme,
        }).from(schema.users)
          .orderBy(desc(schema.users.voteCount), desc(schema.users.profileViews)).limit(24);
        const rows = raw.map((r) => ({
          ...r,
          bg: typeof (r.theme as Record<string, unknown> | null)?.bgImage === "string"
            ? String((r.theme as Record<string, unknown>).bgImage) : null,
        }));
        // Spread across the three cases that actually differ: their own
        // background art, only a banner, and nothing at all.
        return pickVaried(rows, (r) => (r.bg ? "own art" : r.banner ? "banner only" : "no art"))
          .map((r) => ({
            id: r.slug, label: r.name,
            note: r.bg ? "their own background art" : r.banner ? "banner only" : "no art — pure contrast test",
            params: { slug: r.slug },
          }));
      }
      case "challenge": {
        const rows = await db.select({
          id: schema.challenges.id, title: schema.challenges.title,
          cover: schema.challenges.coverUrl, game: schema.challenges.game,
        }).from(schema.challenges).orderBy(desc(schema.challenges.startAt)).limit(24);
        return pickVaried(rows, (r) => (r.cover ? "cover" : "no cover")).map((r) => ({
          id: r.id, label: r.title.slice(0, 40),
          note: r.cover ? `${r.game} · has cover art` : `${r.game} · no cover, falls back`,
          params: { id: r.id },
        }));
      }
      case "game-stats":
      case "planet":
      case "leaderboard": {
        const [games, someone] = await Promise.all([
          db.select({ name: schema.games.name, bg: schema.games.planetBgUrl, cover: schema.games.coverUrl })
            .from(schema.games).where(eq(schema.games.isActive, true))
            .orderBy(schema.games.sortOrder).limit(24),
          db.select({ slug: schema.users.slug }).from(schema.users)
            .orderBy(desc(schema.users.profileViews)).limit(1),
        ]);
        const slug = someone[0]?.slug;
        return pickVaried(games, (g) => (g.bg ? "planet art" : g.cover ? "cover only" : "no art"))
          .map((g) => ({
            id: g.name, label: g.name,
            note: g.bg ? "planet art" : g.cover ? "cover art only" : "no art",
            params: { game: g.name, ...(kind === "game-stats" && slug ? { slug } : {}) },
          }));
      }
      case "quest": {
        const [quests, someone] = await Promise.all([
          db.select({ key: schema.quests.key, name: schema.quests.name }).from(schema.quests).limit(8),
          db.select({ slug: schema.users.slug }).from(schema.users)
            .orderBy(desc(schema.users.profileViews)).limit(1),
        ]);
        return quests.map((q) => ({
          id: q.key, label: q.name, note: "quest map art",
          params: { quest: q.key, ...(someone[0] ? { slug: someone[0].slug } : {}) },
        }));
      }
      case "world": {
        const { getCachedEntityList } = await import("@/lib/game-world-cache");
        const games = await db.select({ name: schema.games.name }).from(schema.games)
          .where(eq(schema.games.isActive, true)).orderBy(schema.games.sortOrder).limit(24);
        const out: CardSample[] = [];
        for (const g of games) {
          if (out.length >= 6) break;
          try {
            const list = await getCachedEntityList(g.name);
            // One of each kind the game has, because a weapon card and a
            // champion card are shaped completely differently.
            const seen = new Set<string>();
            for (const e of list) {
              if (out.length >= 6) break;
              if (seen.has(e.kind)) continue;
              seen.add(e.kind);
              out.push({
                id: `${g.name}:${e.kind}:${e.id}`,
                label: `${e.name}`,
                note: `${g.name} · ${e.kind}`,
                params: { game: g.name, entityKind: e.kind, entity: e.id },
              });
            }
          } catch { /* no catalogue for this game */ }
        }
        return out;
      }
      case "guide": {
        const { GUIDE_TOPICS } = await import("@/lib/cards/guides");
        return Object.entries(GUIDE_TOPICS).slice(0, 6).map(([k, v]) => ({
          id: k, label: (v as { title: string }).title, note: "guide art",
          params: { topic: k },
        }));
      }
      case "week":
        return [
          { id: "race", label: "Mid-week race", note: "voting open, standings moving", params: { mode: "race" } },
          { id: "result", label: "Sunday result", note: "winners called, podium frozen", params: { mode: "result" } },
        ];
      default:
        return [];
    }
  } catch { return []; }
}

/**
 * Up to six samples, spread across the buckets that actually look different.
 *
 * Taking the first six rows would hand back six cards with the same kind of
 * art, which is the failure this exists to prevent: the point of a sample set
 * is coverage, not quantity. Buckets are filled round-robin so the awkward
 * cases (no art at all) are never crowded out by the pretty ones.
 */
function pickVaried<T>(rows: T[], bucketOf: (row: T) => string, max = 6): T[] {
  const buckets = new Map<string, T[]>();
  for (const r of rows) {
    const k = bucketOf(r);
    buckets.set(k, [...(buckets.get(k) ?? []), r]);
  }
  const lists = [...buckets.values()];
  const out: T[] = [];
  for (let i = 0; out.length < max && lists.some((l) => l.length > i); i++) {
    for (const l of lists) {
      if (out.length >= max) break;
      if (l[i]) out.push(l[i]);
    }
  }
  return out;
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
