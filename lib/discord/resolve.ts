import { and, eq, ilike, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { catalog } from "@/lib/discord/catalog";
import { getCachedEntityList } from "@/lib/game-world-cache";
import { searchGamers, findByInGameName, findByDiscordName } from "@/lib/gamer-lookup";
import { slugify } from "@/lib/utils";

// One search box for the whole platform.
//
// `/cluster show <anything>` is the only lookup the bot has, and it has to
// answer for every noun on the platform: a gamer, a game, a planet, a board, a
// challenge, a quest, a trophy — and every champion, agent, weapon and map in
// every game world we carry, plus their skins.
//
// Three rules make it feel smart rather than fussy:
//
//  1. ORDER DOESN'T MATTER. "leaderboard lol" and "lol leaderboard" are the
//     same question. Words that name a TYPE are pulled out wherever they sit,
//     and whatever is left is the subject.
//  2. NICKNAMES COUNT. Nobody types "League of Legends". `lol`, `val`, `cs2`
//     and the rest resolve to the real game.
//  3. ONE HIT OPENS. Search results are a failure mode, not a destination — a
//     query that matches exactly one thing goes straight there, and only a
//     genuine tie produces a picker.

export type Hit = {
  /** What to open. */
  screen: string;
  args: string[];
  /** For the disambiguation card. */
  label: string;
  sub: string;
  kind: string;
  imageUrl?: string | null;
  /** Higher wins. Used to break near-ties before showing a picker. */
  score: number;
};

// The words that name a KIND of thing rather than a thing. Stripped out of the
// query wherever they appear, so word order never matters.
const TYPE_WORDS: Record<string, string> = {
  leaderboard: "leaderboard", leaderboards: "leaderboard", board: "leaderboard", boards: "leaderboard",
  ranking: "leaderboard", rankings: "leaderboard", standings: "leaderboard",
  challenge: "challenge", challenges: "challenge", comp: "challenge", comps: "challenge",
  planet: "planet", planets: "planet", world: "planet", worlds: "planet", game: "planet", games: "planet",
  quest: "quest", quests: "quest",
  trophy: "trophy", trophies: "trophy", prize: "trophy", prizes: "trophy",
  gamer: "gamer", gamers: "gamer", player: "gamer", players: "gamer", profile: "gamer", profiles: "gamer",
  champion: "entity", champions: "entity", agent: "entity", agents: "entity",
  weapon: "entity", weapons: "entity", legend: "entity", legends: "entity",
  hero: "entity", heroes: "entity", map: "entity", maps: "entity", skin: "entity", skins: "entity",
  lore: "entity",
  vote: "week", votes: "week", voting: "week", week: "week",
  cp: "cp", points: "cp",
};

// What people actually type for a game. Checked before any fuzzy matching, so a
// nickname always beats a coincidental substring somewhere else.
const GAME_ALIASES: Record<string, string> = {
  lol: "League of Legends", league: "League of Legends", leagueoflegends: "League of Legends",
  val: "VALORANT", valo: "VALORANT", valorant: "VALORANT",
  cs: "Counter-Strike 2", cs2: "Counter-Strike 2", csgo: "Counter-Strike 2", counterstrike: "Counter-Strike 2",
  dota: "Dota 2", dota2: "Dota 2",
  apex: "Apex Legends",
  fn: "Fortnite", fort: "Fortnite",
  mc: "Minecraft", minecraft: "Minecraft",
  pubg: "PUBG",
  ml: "Mobile Legends", mlbb: "Mobile Legends",
  osu: "osu!",
  cod: "Call of Duty",
  clash: "Clash Royale",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Split a raw query into the type words it mentions and the subject left over. */
export function parseQuery(raw: string): { types: Set<string>; subject: string } {
  const types = new Set<string>();
  const rest: string[] = [];
  for (const word of (raw ?? "").trim().split(/\s+/).filter(Boolean)) {
    const t = TYPE_WORDS[norm(word)];
    if (t) types.add(t);
    else rest.push(word);
  }
  return { types, subject: rest.join(" ").trim() };
}

/** A game name from a nickname, an exact name, or a clear partial. */
export async function resolveGame(subject: string): Promise<string | null> {
  if (!subject) return null;
  const n = norm(subject);
  if (GAME_ALIASES[n]) return GAME_ALIASES[n];
  const c = await catalog();
  const exact = c.games.find((g) => norm(g.name) === n);
  if (exact) return exact.name;
  const starts = c.games.filter((g) => norm(g.name).startsWith(n));
  if (starts.length === 1) return starts[0].name;
  const has = c.games.filter((g) => norm(g.name).includes(n));
  return has.length === 1 ? has[0].name : null;
}

// ===== The search =====

/**
 * Everything on the platform that answers to this query.
 *
 * Deliberately returns ALL hits rather than the best one: the caller decides
 * whether a single result opens directly or a tie needs a picker, and the
 * disambiguation card needs the losers to list them.
 */
export async function search(raw: string, opts: { limit?: number } = {}): Promise<Hit[]> {
  const query = (raw ?? "").trim();
  if (!query) return [];
  const { types, subject } = parseQuery(query);
  const term = subject || query;
  const n = norm(term);
  const hits: Hit[] = [];
  const want = (t: string) => types.size === 0 || types.has(t);

  const c = await catalog().catch(() => ({ games: [], quests: [], guides: [] }));

  // ---- Games and planets
  const gameName = await resolveGame(term).catch(() => null);
  if (gameName) {
    // A type word decides WHICH card about the game to open. "lol leaderboard"
    // is the boards for League, not League's planet.
    const screen = types.has("leaderboard") ? "leaderboard"
      : types.has("challenge") ? "challenges"
        : "planet";
    hits.push({
      screen, args: [gameName], label: gameName,
      sub: screen === "leaderboard" ? "Leaderboards" : screen === "challenges" ? "Live challenges" : "Game planet",
      kind: screen === "planet" ? "planet" : screen, score: 100,
    });
  }

  // A bare type word with no subject — "leaderboards", "challenges" — is a
  // valid, complete question: show the index.
  if (!subject && types.size) {
    if (types.has("leaderboard")) hits.push({ screen: "leaderboard", args: [""], label: "All leaderboards", sub: "Every board on every game", kind: "leaderboard", score: 95 });
    if (types.has("challenge")) hits.push({ screen: "challenges", args: [], label: "Live challenges", sub: "Everything running right now", kind: "challenge", score: 95 });
    if (types.has("planet")) hits.push({ screen: "planets", args: [], label: "All planets", sub: "Every game we sync", kind: "planet", score: 95 });
    if (types.has("quest")) hits.push({ screen: "quests", args: [], label: "All quests", sub: "Every Cluster Points ladder", kind: "quest", score: 95 });
    if (types.has("week")) hits.push({ screen: "week", args: [], label: "Profile of the Week", sub: "This week's vote", kind: "week", score: 95 });
    if (types.has("cp")) hits.push({ screen: "show", args: ["cp"], label: "My Cluster Points", sub: "Your total across every quest", kind: "cp", score: 95 });
    if (types.has("trophy")) hits.push({ screen: "trophies", args: [], label: "Trophies", sub: "The prize catalogue", kind: "trophy", score: 95 });
  }

  if (subject) {
    // ---- Quests
    if (want("quest")) {
      for (const q of c.quests) {
        if (norm(q.name) === n || norm(q.value) === n) hits.push({ screen: "quest", args: [q.value], label: q.name, sub: "Quest", kind: "quest", score: 90 });
        else if (norm(q.name).includes(n) && n.length >= 3) hits.push({ screen: "quest", args: [q.value], label: q.name, sub: "Quest", kind: "quest", score: 60 });
      }
    }

    const db = await getDb().catch(() => null);

    // ---- Challenges and trophies, by title
    if (db && want("challenge")) {
      try {
        const rows = await db.select({ id: schema.challenges.id, title: schema.challenges.title, game: schema.challenges.game, cover: schema.challenges.coverUrl })
          .from(schema.challenges)
          .where(and(eq(schema.challenges.status, "active"), ilike(schema.challenges.title, `%${term}%`)))
          .limit(6);
        for (const r of rows) {
          hits.push({ screen: "challenge", args: [r.id], label: r.title, sub: `Challenge · ${r.game}`, kind: "challenge", imageUrl: r.cover, score: norm(r.title) === n ? 92 : 65 });
        }
      } catch { /* a search that can't reach one table still answers from the rest */ }
    }
    if (db && want("trophy")) {
      try {
        const rows = await db.select({ id: schema.trophies.id, name: schema.trophies.name, imageUrl: schema.trophies.imageUrl, value: schema.trophies.value })
          .from(schema.trophies).where(ilike(schema.trophies.name, `%${term}%`)).limit(5);
        for (const r of rows) {
          hits.push({ screen: "trophy", args: [r.id], label: r.name, sub: Number(r.value) > 0 ? `Trophy · $${Math.round(Number(r.value)).toLocaleString()}` : "Trophy", kind: "trophy", imageUrl: r.imageUrl, score: norm(r.name) === n ? 92 : 62 });
        }
      } catch { /* non-fatal */ }
    }

    // ---- Game-world entities: champions, agents, weapons, maps, and skins.
    //
    // Searched across EVERY game, because a gamer typing "Jett" should not have
    // to say which game she is from — that's the whole point of a flat search.
    if (want("entity")) {
      for (const g of c.games.slice(0, 24)) {
        let list: Awaited<ReturnType<typeof getCachedEntityList>> = [];
        try { list = await getCachedEntityList(g.name); } catch { continue; }
        for (const e of list) {
          const en = norm(e.name);
          if (en === n) hits.push({ screen: "world", args: [g.name, e.kind, e.id], label: e.name, sub: `${e.role ? `${e.role} · ` : ""}${g.name}`, kind: e.kind, imageUrl: e.image, score: 88 });
          else if (n.length >= 3 && en.startsWith(n)) hits.push({ screen: "world", args: [g.name, e.kind, e.id], label: e.name, sub: `${e.role ? `${e.role} · ` : ""}${g.name}`, kind: e.kind, imageUrl: e.image, score: 58 });
        }
      }
    }

    // ---- Gamers: by in-game name, by Discord handle, by display name.
    if (want("gamer")) {
      try {
        // In-game names are per game, so a bare tag is looked up on EVERY game
        // — that is exactly the duplicate case the picker exists for: the same
        // handle on Valorant and on Fortnite is two different people.
        const [byIgn, byDiscord, byName] = await Promise.all([
          Promise.all(c.games.slice(0, 24).map((g) => findByInGameName(g.name, term).catch(() => null))),
          findByDiscordName(term).catch(() => null),
          searchGamers(term, 5).catch(() => []),
        ]);
        for (const g of byIgn) {
          if (!g) continue;
          hits.push({ screen: "gamer", args: ["slug", g.slug], label: g.displayName, sub: `${g.inGameName} · ${g.game}`, kind: "gamer", imageUrl: g.avatarUrl, score: 86 });
        }
        if (byDiscord) hits.push({ screen: "gamer", args: ["slug", byDiscord.slug], label: byDiscord.displayName, sub: "Discord handle", kind: "gamer", imageUrl: byDiscord.avatarUrl, score: 84 });
        for (const g of byName) {
          hits.push({ screen: "gamer", args: ["slug", g.slug], label: g.displayName, sub: `@${g.slug}`, kind: "gamer", imageUrl: g.avatarUrl, score: norm(g.displayName) === n ? 82 : 50 });
        }
      } catch { /* non-fatal */ }
    }
  }

  // One entry per destination — the same gamer found by tag AND by name is one
  // result, not a tie with themselves.
  const best = new Map<string, Hit>();
  for (const h of hits) {
    const key = `${h.screen}|${h.args.join("~")}`;
    const prev = best.get(key);
    if (!prev || h.score > prev.score) best.set(key, h);
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 8);
}

/**
 * What `/cluster show <query>` should do.
 *
 * `open` when there is one clear answer — including when several hits exist but
 * one is decisively better, because "Jett the agent" beating "a gamer called
 * jett99" is not a real tie. `pick` only when the field is genuinely level.
 */
export type Resolution =
  | { type: "open"; hit: Hit }
  | { type: "pick"; hits: Hit[] }
  | { type: "none"; query: string };

export async function resolveShow(raw: string): Promise<Resolution> {
  const hits = await search(raw);
  if (!hits.length) return { type: "none", query: raw.trim() };
  if (hits.length === 1) return { type: "open", hit: hits[0] };
  // A 20-point gap is the difference between an exact match and a prefix match,
  // so anything that clear opens rather than asking.
  if (hits[0].score - hits[1].score >= 20) return { type: "open", hit: hits[0] };
  return { type: "pick", hits };
}

/** The skins of one entity, for the `show <champion> <skin>` continuation. */
export async function skinsOf(game: string, kind: string, id: string): Promise<{ name: string; image: string }[]> {
  try {
    const { getCachedEntityDetail } = await import("@/lib/game-world-cache");
    const e = await getCachedEntityDetail(game, kind, id);
    return e?.skins ?? [];
  } catch { return []; }
}

export { GAME_ALIASES, TYPE_WORDS, slugify, or };
