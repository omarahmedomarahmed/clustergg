import type { CardKind } from "@/lib/cards/types";

// WHERE each pane's content comes from (B58).
//
// The card-layout editor was a drawing tool, and drawing is not what it is for
// any more — the cards are built in code. What an admin actually needs to say is
// which two ladders the planet card shows, which three challenges, which heroes
// from the game world, which trophies lead the shelf. And a gamer needs the same
// power over their own card: which four accounts appear when the card can only
// draw four.
//
// So a pane declares a REFERENCE: a source id plus its options, resolved at
// render time. This module is the model and nothing else — no database, no CMS,
// no server imports — because the layout editor is a client component and needs
// the same types and the same parser the renderer uses. Reading a reference's
// actual rows lives in the data loaders.
//
// Three rules this file exists to enforce, and each of them is a bug that would
// otherwise be found in production:
//
//   1. **A reference is an id or an enum, never free text.** Whatever an admin
//      types must not reach Satori — B54's rule, and the reason a card cannot be
//      taken down from the layout screen.
//   2. **An unset reference is not an empty card.** Every source has a fallback
//      that is what the card already did, so a pane nobody has configured draws
//      what it drew before rather than nothing.
//   3. **A gamer's override can only NARROW.** It picks from their own rows and
//      can hide them; it can never widen the set, and it can never name a row
//      that is not theirs.

/** What kind of thing a source yields. Panes accept sources of their own shape. */
export type RefShape = "boards" | "challenges" | "world" | "trophies" | "accounts";

export type CardRefSource = {
  id: string;
  label: string;
  shape: RefShape;
  /** One line in the editor: what an admin gets if they pick this. */
  note: string;
  /**
   * True when the source takes explicit ids — "these three challenges" — rather
   * than computing its own list. The editor shows a picker for these and a
   * plain choice for the rest.
   */
  picks?: boolean;
};

/**
 * Every source a pane can pull from.
 *
 * Deliberately small and deliberately named after what an ADMIN would say. A
 * registry with forty entries is a registry nobody reads; the ones here are the
 * choices that were actually asked for.
 */
export const REF_SOURCES: CardRefSource[] = [
  // Ladders.
  { id: "boards.auto", label: "The game's own boards", shape: "boards", note: "Whatever ladders this game runs, newest first. What the card does today." },
  { id: "boards.pick", label: "These boards", shape: "boards", note: "Name the ladders yourself, in the order you want them read.", picks: true },

  // Competitions.
  { id: "challenges.live", label: "Whatever is live", shape: "challenges", note: "Every running challenge on this game, soonest to end first." },
  { id: "challenges.pick", label: "These challenges", shape: "challenges", note: "Name them yourself — a launch you want in front of people stays in front of them.", picks: true },
  { id: "challenges.sponsored", label: "Sponsored first", shape: "challenges", note: "A brand's competitions lead, then whatever else is live." },

  // The game world.
  { id: "world.auto", label: "Whatever the snapshot has", shape: "world", note: "The first few entities from the game's cached world." },
  { id: "world.pick", label: "These heroes / weapons / maps", shape: "world", note: "Name them yourself. A game with two hundred champions needs somebody to choose four.", picks: true },

  // The shelf.
  { id: "trophies.affordable", label: "What they can afford", shape: "trophies", note: "Cheapest first, so the shelf opens on something reachable." },
  { id: "trophies.pick", label: "These trophies", shape: "trophies", note: "Lead the shelf with the ones you want bought.", picks: true },
  { id: "trophies.valuable", label: "Most valuable first", shape: "trophies", note: "The shelf as a shop window. What the card does today." },

  // A gamer's own accounts — the one shape a GAMER also controls.
  { id: "accounts.recent", label: "Most recently linked", shape: "accounts", note: "What the card does today." },
  { id: "accounts.pick", label: "These accounts", shape: "accounts", note: "The gamer chooses which of their accounts the card shows.", picks: true },
];

export const sourceById = (id: string): CardRefSource | null =>
  REF_SOURCES.find((s) => s.id === id) ?? null;

/** One pane's reference: a source, and the ids it was pointed at. */
export type CardRef = { source: string; ids?: string[] };

/**
 * What each kind's panes pull, before anybody says otherwise.
 *
 * A DEFAULT, not a rule — and it is what the card already did, which is what
 * makes an unconfigured pane draw something rather than nothing. Keyed by the
 * kind and the part it feeds, so it lines up with `layout-guide.ts`'s parts and
 * an admin edits a named section rather than "pane 3".
 */
export const DEFAULT_REFS: Partial<Record<CardKind, Record<string, CardRef>>> = {
  planet: {
    boards: { source: "boards.auto" },
    challenges: { source: "challenges.live" },
    world: { source: "world.auto" },
  },
  profile: {
    accounts: { source: "accounts.recent" },
  },
  market: {
    tiles: { source: "trophies.valuable" },
  },
};

/** The ids in a reference, cleaned. Never free text — see rule 1. */
const cleanIds = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    // Ids in this codebase are `uid()` output and slugs: letters, digits, dash,
    // underscore. Anything else is not an id somebody has, so it is dropped
    // rather than passed down to a query.
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x.length <= 64 && /^[A-Za-z0-9_-]+$/.test(x))
    .slice(0, 12);
};

/**
 * Parse whatever is stored into references that are safe to resolve.
 *
 * Round-tripped through here on the way IN as well as out, so the same clamps
 * that protect the renderer protect what gets saved — one definition of valid,
 * which is the lesson `parseLayout` already learned the hard way.
 */
export function parseRefs(raw: unknown, kind?: CardKind): Record<string, CardRef> {
  const base = (kind && DEFAULT_REFS[kind]) || {};
  const out: Record<string, CardRef> = { ...base };
  if (!raw || typeof raw !== "object") return out;
  for (const [part, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-z0-9-]{1,32}$/i.test(part)) continue;
    const o = (v ?? {}) as Partial<CardRef>;
    const src = typeof o.source === "string" ? sourceById(o.source) : null;
    // An unknown source falls back to this part's default rather than blanking
    // the pane: a source id that was renamed or removed must not empty a card.
    if (!src) continue;
    out[part] = { source: src.id, ...(src.picks ? { ids: cleanIds(o.ids) } : {}) };
  }
  return out;
}

/** The reference for one part, with the kind's default behind it. */
export function refFor(refs: Record<string, CardRef> | undefined, kind: CardKind, part: string): CardRef {
  return refs?.[part] ?? DEFAULT_REFS[kind]?.[part] ?? { source: "" };
}

// ===== The gamer's own narrowing =====

/** What a gamer may say about their OWN card. */
export type GamerCardPrefs = {
  /** Which of their linked accounts the card may draw, by account id. */
  accounts?: string[];
  /** Sections they have switched off on their own card. */
  hide?: string[];
  /** Their card on their public profile page (B59). Default on. */
  showOnProfile?: boolean;
};

export function parseGamerPrefs(raw: unknown): GamerCardPrefs {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    accounts: cleanIds(o.accounts),
    hide: cleanIds(o.hide),
    showOnProfile: o.showOnProfile !== false,
  };
}

/**
 * Apply a gamer's choice to their own rows.
 *
 * **Narrowing only, and this is the whole security of the feature.** The
 * selection is used as a FILTER over rows that were already fetched for this
 * gamer — it is never a query. So an id they do not own selects nothing rather
 * than selecting somebody else's account, and an empty or absent selection
 * means "all of mine", not "none".
 */
export function narrow<T extends { id: string }>(rows: T[], picked: string[] | undefined): T[] {
  if (!picked || picked.length === 0) return rows;
  const want = new Set(picked);
  const kept = rows.filter((r) => want.has(r.id));
  // A selection that matches nothing is a stale one — a gamer who unlinked the
  // account they had chosen. Showing them an empty card for it would be
  // punishing them for our own stale row, so it falls back to everything.
  return kept.length ? kept : rows;
}

/** Has this gamer switched this section off on their own card? */
export const hidden = (prefs: GamerCardPrefs | undefined, part: string): boolean =>
  (prefs?.hide ?? []).includes(part);
