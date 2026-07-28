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

/**
 * Champions, agents, legends, weapons and maps — every game world we carry.
 *
 * Typing one of these already WORKED: the flat resolver matches entity names
 * across every game. What it didn't do was appear while you type, which means
 * you had to already know the name to find it. Lore is the thing people browse
 * rather than look up, so it belongs in the suggestions.
 *
 * Only searched at two characters or more. Twenty-four game catalogues scanned
 * on every keystroke of an empty box is a lot of work to produce a list nobody
 * asked for, and Discord's budget for the whole reply is about three seconds.
 */
export async function worldChoices(q: string, limit = 8): Promise<Choice[]> {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  try {
    const { getCachedEntityList } = await import("@/lib/game-world-cache");
    const c = await catalog();
    const out: Choice[] = [];
    for (const g of c.games) {
      if (out.length >= limit) break;
      let list: Awaited<ReturnType<typeof getCachedEntityList>> = [];
      try { list = await getCachedEntityList(g.name); } catch { continue; }
      for (const e of list) {
        if (out.length >= limit) break;
        if (!e.name.toLowerCase().includes(needle)) continue;
        out.push({
          name: `${e.name} — ${e.role ? `${e.role}, ` : ""}${g.name}`.slice(0, 100),
          value: `world:${g.name}:${e.kind}:${e.id}`.slice(0, 100),
        });
      }
    }
    return out;
  } catch { return []; }
}

/**
 * Everything a server's staff can do, in the same box as everything else.
 *
 * These used to be two entries — run a challenge, see growth — while the bot
 * could actually do six things. An action that exists but is only reachable by
 * pressing a button on a screen you have to know to open is an action most
 * owners never find.
 */
export function adminChoices(): Choice[] {
  return [
    { name: "Server admin — run a challenge", value: "admin" },
    { name: "Server admin — our growth to the unlock", value: "admin:growth" },
    { name: "Server admin — DM me my portal key", value: "admin:key" },
    { name: "Server admin — sponsored posts switch", value: "admin:ads" },
    { name: "Server admin — daily competition post switch", value: "admin:announce" },
    { name: "Server admin — post the guides again", value: "admin:guides" },
    { name: "Server admin — use this channel for Cluster", value: "admin:channel" },
  ];
}

// The whole bot, in one autocomplete.
//
// `/cluster` now takes a single box, so this is the entire menu — everything a
// subcommand used to be, plus everything a subcommand's option used to be, as
// flat destinations. Built from live data, so a game added this morning is
// typeable this morning.
//
// Ordering is deliberate: with a 25-choice cap and an empty query, what shows
// is what a first-time user sees. Identity first (it's why they typed the
// command), then the things to do, then the reference material.
export async function openChoices(q: string, opts: { isManager?: boolean } = {}): Promise<Choice[]> {
  const c = await catalog();
  const list: Choice[] = [
    { name: "My profile card", value: "profile" },
    { name: "My Cluster Points", value: "cp" },
    // High in the list on purpose: it's the one competition everybody is
    // already in, and the daily post makes it the thing people come looking for.
    { name: "Profile of the Week — the vote", value: "week" },
    { name: "Live challenges", value: "challenges:" },
    { name: "All games", value: "planets" },
    { name: "Share my profile publicly", value: "share" },
    ...c.games.map((g) => ({ name: `${g.name} — planet`, value: `planet:${g.value}` })),
    ...c.games.map((g) => ({ name: `${g.name} — my stats`, value: `game:${g.value}` })),
    ...c.games.map((g) => ({ name: `${g.name} — leaderboard`, value: `board:${g.value}` })),
    ...c.games.map((g) => ({ name: `${g.name} — link my account`, value: `link:${g.value}` })),
    ...c.quests.map((qq) => ({ name: `${qq.name} — my progress`, value: `quest:${qq.value}` })),
    ...(opts.isManager ? adminChoices() : []),
    ...c.guides.map((g) => ({ name: `Guide — ${g.name}`, value: `guide:${g.value}` })),
    { name: "Everything this bot does", value: "help" },
  ];

  // People and lore are looked up live rather than cached: they change by the
  // minute and there are far too many to hold in a list. They go FIRST once
  // there's a query, because somebody who typed three letters of a name is
  // looking for that name, not for a menu item that happens to contain it.
  const [gamers, world] = q.trim().length >= 2
    ? await Promise.all([
      import("@/lib/gamer-lookup").then((m) => m.gamerChoices(q, 6)).catch(() => []),
      worldChoices(q, 6).catch(() => []),
    ])
    : [[], []];

  return [...gamers, ...world, ...match(list, q)].slice(0, 25);
}
