import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { GUIDE_TOPICS } from "@/lib/cards/guides";

// The autocomplete catalog. Discord gives an autocomplete interaction ~3 seconds
// and fires one on nearly every keystroke, so this is cached in module memory
// with a short TTL rather than hitting the database each time.

export type Choice = { name: string; value: string };

type Catalog = { games: Choice[]; quests: Choice[]; guides: Choice[]; at: number };

const TTL_MS = 5 * 60 * 1000;
let cache: Catalog | null = null;

export async function catalog(): Promise<Catalog> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;

  const empty: Catalog = { games: [], quests: [], guides: [], at: Date.now() };
  try {
    const db = await getDb();
    const [games, quests] = await Promise.all([
      db.select({ name: schema.games.name }).from(schema.games).where(eq(schema.games.isActive, true)).orderBy(schema.games.sortOrder),
      db.select({ name: schema.quests.name, key: schema.quests.key }).from(schema.quests).where(eq(schema.quests.isActive, true)).orderBy(schema.quests.sortOrder),
    ]);
    const built: Catalog = {
      games: games.map((g) => ({ name: g.name, value: g.name })),
      quests: quests.map((q) => ({ name: q.name, value: q.key })),
      guides: [
        ...Object.entries(GUIDE_TOPICS).map(([k, v]) => ({ name: v.title, value: k })),
        ...quests.map((q) => ({ name: `${q.name} — how to win`, value: `quest:${q.key}` })),
      ],
      at: Date.now(),
    };
    cache = built;
    return built;
  } catch {
    return cache ?? empty;
  }
}

// Staff edits to games/quests should show up in autocomplete without waiting
// out the TTL.
export function clearCatalog() { cache = null; }

function match(list: Choice[], q: string): Choice[] {
  const needle = q.trim().toLowerCase();
  const hits = needle ? list.filter((c) => c.name.toLowerCase().includes(needle) || c.value.toLowerCase().includes(needle)) : list;
  // Discord hard-caps autocomplete at 25 choices.
  return hits.slice(0, 25);
}

export async function gameChoices(q: string): Promise<Choice[]> {
  return match((await catalog()).games, q);
}

export async function questChoices(q: string): Promise<Choice[]> {
  return match((await catalog()).quests, q);
}

export async function guideChoices(q: string): Promise<Choice[]> {
  return match((await catalog()).guides, q);
}

// `/cluster show <what>` accepts profile, cp, any linked game and any quest —
// so its autocomplete is the union, with the identity options first.
export async function showChoices(q: string): Promise<Choice[]> {
  const c = await catalog();
  const list: Choice[] = [
    { name: "My profile", value: "profile" },
    { name: "My Cluster Points", value: "cp" },
    ...c.games.map((g) => ({ name: `${g.name} stats`, value: `game:${g.value}` })),
    ...c.quests.map((qq) => ({ name: `${qq.name} quest`, value: `quest:${qq.value}` })),
  ];
  return match(list, q);
}
