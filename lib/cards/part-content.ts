import type { CardData } from "@/lib/cards/types";

// What each named section of a card will actually say.
//
// The layout editor draws a card's sections as boxes you can select and move.
// A box labelled "Recent matches" with nothing inside it is a diagram of a
// card, and arranging diagrams is not designing — the whole question an editor
// answers is "does my art survive THIS headline, THESE eight rows". So each box
// is filled with the real strings the renderer is about to draw.
//
// Deliberately a summary, not a re-implementation of the renderer. A few lines
// per section is enough to see length, wrapping pressure, and whether a section
// is empty for this particular card; reproducing Satori's exact typography in
// HTML would be a second renderer to keep in sync, and the PNG underneath is
// already the authority on how it really looks.
//
// Every key below is a real section key from `layout-guide.ts`. They were
// checked against it rather than guessed — a mapping that invents keys produces
// an editor full of empty boxes and no way to tell that from a card with no
// data, which is the one distinction this file exists to make.
//
// Pure: no server imports, no database. It takes the card object the API hands
// back and returns strings, so the editor can call it in the browser.

export type PartContent = {
  /** Short lines to draw inside the section's box, in order. */
  lines: string[];
  /** Image URLs this section draws, when it draws any. */
  images: string[];
  /** True when this sample gives the section nothing — worth seeing. */
  empty: boolean;
};

const EMPTY: PartContent = { lines: [], images: [], empty: true };

const take = (xs: (string | null | undefined)[], n = 5): string[] =>
  xs.filter((x): x is string => !!x && String(x).trim().length > 0).map(String).slice(0, n);

const made = (lines: string[], images: (string | null | undefined)[] = []): PartContent => {
  const imgs = images.filter((i): i is string => !!i).slice(0, 6);
  return { lines, images: imgs, empty: lines.length === 0 && imgs.length === 0 };
};

const day = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/**
 * One section's content, for one real card.
 *
 * An unknown key returns empty rather than throwing: guides gain sections over
 * time, and an editor that crashes on a section it hasn't learned about yet is
 * worse than one that shows an empty box.
 */
export function partContent(data: CardData, key: string): PartContent {
  try {
    return resolve(data, key);
  } catch { return EMPTY; }
}

function resolve(d: CardData, key: string): PartContent {
  switch (d.kind) {
    // profile | identity, stats, trophies, challenges, accounts
    case "profile":
      switch (key) {
        case "identity":
          return made(take([d.displayName, d.title, d.slug ? `clustergg.com/u/${d.slug}` : null, d.award]),
            [d.avatarUrl]);
        case "stats":
          return made(take([
            `Level ${d.level}`,
            `${d.totalCp.toLocaleString()} CP`,
            `${d.views.toLocaleString()} views`,
            `${d.votes.toLocaleString()} votes`,
          ]));
        case "trophies":
          return made(
            take([
              ...(d.trophies ?? []).map((t) => t.name),
              d.trophyCount ? `${d.trophyCount} won in total` : null,
            ]),
            (d.trophies ?? []).map((t) => t.imageUrl),
          );
        case "challenges":
          return made(take((d.challenges ?? []).map((c) =>
            `${c.title} — ${c.live ? "live" : "ended"}${c.place ? ` · #${c.place}` : ""} · ${c.points} pts`)));
        case "accounts":
          return made(
            take(d.accounts.map((a) => `${a.game} · ${a.tag}${a.headline ? ` — ${a.headline}` : ""}`)),
            d.accounts.map((a) => a.logoUrl),
          );
        default: return EMPTY;
      }

    // game-stats | identity, live, stats, champions, matches, rank, empty
    case "game-stats":
      switch (key) {
        case "identity":
          return made(take([d.displayName, `${d.game} · ${d.tag}`, d.region]),
            [d.logoUrl, d.gameAvatarUrl ?? d.avatarUrl]);
        case "live":
          return made(take([d.live ? `In game${d.live.champion ? ` as ${d.live.champion}` : ""}${d.live.queue ? ` · ${d.live.queue}` : ""}` : null]));
        case "stats":
          return made(take(d.stats.map((s) => `${s.label}: ${s.value}`), 6));
        case "champions":
          return made(
            take((d.champions ?? []).map((c) => `${c.name}${c.level ? ` · lvl ${c.level}` : ""}`)),
            (d.champions ?? []).map((c) => c.iconUrl),
          );
        case "matches":
          return made(
            take((d.matches ?? []).map((m) => `${m.win ? "W" : "L"} ${m.champion} · ${m.kda}${m.queue ? ` · ${m.queue}` : ""}`)),
            (d.matches ?? []).map((m) => m.iconUrl),
          );
        case "rank":
          return made(take([d.rank ? `#${d.rank.place} of ${d.rank.total} · ${d.rank.board}` : null]));
        case "empty":
          return made(take([d.stats.length ? null : "Nothing synced yet — the empty state"]));
        default: return EMPTY;
      }

    // challenge | status, title, meta, timeline, standings, trophies, empty
    case "challenge":
      switch (key) {
        case "status":
          return made(take([
            d.ended ? "ENDED" : "LIVE",
            d.isPrivate ? "SERVER CHALLENGE" : null,
            d.serverName,
          ]));
        case "title":
          return made(take([d.title, d.game, d.description]), [d.logoUrl]);
        case "meta":
          return made(take([
            `${d.participants} entered`,
            d.prize ? `Prize: ${d.prize}` : null,
          ]));
        case "timeline":
          return made(take([
            d.startsAt ? `Starts ${day(d.startsAt)}` : null,
            `Ends ${day(d.endsAt) ?? d.endsAt}`,
          ]));
        case "standings":
          return made(take((d.standings ?? []).map((r) => `${r.place}. ${r.name} — ${r.points}`), 5));
        case "trophies":
          return made(
            take((d.trophies ?? []).map((t) => `${t.place}. ${t.name} · $${t.value}`)),
            (d.trophies ?? []).map((t) => t.imageUrl),
          );
        case "empty":
          return made(take([(d.standings ?? []).length ? null : "Nobody has entered yet — the empty state"]));
        default: return EMPTY;
      }

    // leaderboard | title, rows, empty
    case "leaderboard":
      switch (key) {
        case "title":
          return made(take([d.title, d.subtitle, d.game]), [d.logoUrl]);
        case "rows":
          return made(take(d.rows.map((r) => `${r.rank}. ${r.name} — ${r.value}${r.you ? " (you)" : ""}`), 6));
        case "empty":
          return made(take([d.rows.length ? null : "No ranked players yet — the empty state"]));
        default: return EMPTY;
      }

    // planet | title, challenges, boards
    case "planet":
      switch (key) {
        case "title":
          return made(take([d.game, d.description, `${d.gamers.toLocaleString()} gamers`]), [d.logoUrl]);
        case "challenges":
          return made(take(d.challenges.map((c) =>
            `${c.title} · ${c.participants} in${c.prize ? ` · ${c.prize}` : ""}`)));
        case "boards":
          return made(take(d.boards.map((b) =>
            `${b.title}${b.leader ? ` — ${b.leader} ${b.value ?? ""}` : ""} (${b.entries})`)));
        default: return EMPTY;
      }

    // planets | title, tiles
    case "planets":
      switch (key) {
        case "title":
          return made(take([d.title, d.subtitle]));
        case "tiles":
          return made(take(d.games.map((g) => g.name), 8), d.games.map((g) => g.logoUrl));
        default: return EMPTY;
      }

    // quest | title, progress, tiers
    case "quest":
      switch (key) {
        case "title":
          return made(take([d.questName, d.tagline, d.displayName]), [d.logoUrl]);
        case "progress":
          return made(take([
            d.currentTier ? `Now: ${d.currentTier}` : null,
            `${d.cp.toLocaleString()} CP`,
            d.nextTier && d.nextThreshold ? `Next: ${d.nextTier} at ${d.nextThreshold.toLocaleString()}` : null,
          ]));
        case "tiers":
          return made(take(d.tiers.map((t) => `${t.name} · ${t.threshold.toLocaleString()} CP${t.earned ? " ✓" : ""}`), 5));
        default: return EMPTY;
      }

    // cp-summary | title, quests
    case "cp-summary":
      switch (key) {
        case "title":
          return made(take([d.displayName, `${d.totalCp.toLocaleString()} CP`, `Level ${d.level}`]));
        case "quests":
          return made(take(d.quests.map((q) => `${q.name} — ${q.cp}/${q.target} · ${q.tier}`), 5));
        default: return EMPTY;
      }

    // week | title, rows, pills, empty
    case "week":
      switch (key) {
        case "title":
          return made(take([d.title, d.subtitle, d.mode === "result" ? "Winners called" : "Voting open"]));
        case "rows":
          return made(
            take(d.entries.map((e) => `${e.rank}. ${e.name} — ${e.weekVotes} this week`), 6),
            d.entries.map((e) => e.avatarUrl),
          );
        case "pills":
          return made(take([
            `${d.totalVotes.toLocaleString()} votes`,
            `${d.contenders} contenders`,
            d.mode === "race" ? `${d.daysLeft}d left` : null,
            d.trophy ? `${d.trophy.name} · $${d.trophy.value}` : null,
          ]));
        case "empty":
          return made(take([d.entries.length ? null : "Nobody has votes yet — the empty state"]));
        default: return EMPTY;
      }

    // guide | status, title, steps, footer
    case "guide":
      switch (key) {
        case "status":
          return made(take([d.badge]));
        case "title":
          return made(take([d.title, d.subtitle]), [d.logoUrl]);
        case "steps":
          return made(take(d.steps.map((s) => `${s.title} — ${s.body}`), 5));
        case "footer":
          return made(take([d.footer]));
        default: return EMPTY;
      }

    // world | status, title, lore, abilities, art, meta
    case "world":
      switch (key) {
        case "status":
          return made(take([d.entityKind.toUpperCase(), d.role]));
        case "title":
          return made(take([d.name, d.skinName, d.game]), [d.logoUrl]);
        case "lore":
          return made(take([d.lore], 1));
        case "abilities":
          return made(
            take(d.abilities.map((a) => `${a.name} — ${a.desc}`)),
            d.abilities.map((a) => a.iconUrl),
          );
        case "art":
          return made(d.artUrl ? ["The splash, drawn undimmed"] : [], [d.artUrl]);
        case "meta":
          return made(take([
            ...d.meta.map((m) => `${m.label}: ${m.value}`),
            d.skinCount ? `${d.skinCount} skins` : null,
          ]));
        default: return EMPTY;
      }

    // search | title, rows
    case "search":
      switch (key) {
        case "title":
          return made(take([`"${d.query}"`, `${d.results.length} matches`]));
        case "rows":
          return made(
            take(d.results.map((r) => `${r.label} — ${r.sub} (${r.kind})`), 6),
            d.results.map((r) => r.imageUrl),
          );
        default: return EMPTY;
      }

    default:
      return EMPTY;
  }
}
