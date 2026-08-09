// A podium of any depth. B91.7.
//
// ===== WHAT IT WAS =====
//
// `challenges.prizes` held `{ first, second, third }` — three named slots, each
// a list of trophy ids. That is a podium, and a podium is one shape of prize
// pool among several. A custom deal is routinely "one winner takes everything"
// or "the top ten each get something", and neither could be expressed: a
// ten-winner challenge had to be built as a three-winner one and the other
// seven handed out by hand, which means seven trophies that are not on anybody's
// profile and not in the prize vault's arithmetic.
//
// ===== WHAT IT IS =====
//
// `places` — an array indexed by finishing position, each entry a list of
// trophy ids. Place 1 is `places[0]`. Up to `MAX_PLACES`.
//
// The old shape is still READ, because there are challenges in the database
// holding it and a migration that rewrites live prize data is a migration that
// can lose a trophy somebody already won. `placesOf` normalises both, and every
// writer emits the new shape.

export const MAX_PLACES = 10;

/** What `challenges.prizes` may hold. Both shapes, because both exist. */
export type PrizeBag = {
  /** B91.7 and after. Index 0 is first place. */
  places?: (string[] | null | undefined)[];
  /** Before B91.7. Read, never written. */
  first?: string[] | null;
  second?: string[] | null;
  third?: string[] | null;
} | null | undefined;

const clean = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map(String).map((s) => s.trim()).filter(Boolean))] : [];

/**
 * The podium, normalised: `places[0]` is first place.
 *
 * Trailing empty places are trimmed. A challenge whose "top ten" has trophies
 * for the first four and nothing after is a four-place challenge — leaving six
 * empty rungs on it would tell a gamer they can place sixth and win something.
 */
export function placesOf(prizes: PrizeBag, legacyTrophyId?: string | null): string[][] {
  const out: string[][] = [];

  if (prizes?.places && Array.isArray(prizes.places)) {
    for (const p of prizes.places) out.push(clean(p));
  } else {
    out.push(clean(prizes?.first));
    out.push(clean(prizes?.second));
    out.push(clean(prizes?.third));
  }

  // `challenges.trophyId` is older still: one trophy, first place, no list.
  if (!out.some((p) => p.length) && legacyTrophyId) out[0] = [legacyTrophyId];

  while (out.length && !out[out.length - 1].length) out.pop();
  return out.slice(0, MAX_PLACES);
}

/** How many finishing positions actually win something. */
export const payingPlaces = (prizes: PrizeBag, legacyTrophyId?: string | null): number =>
  placesOf(prizes, legacyTrophyId).length;

/** The trophies for one finishing position. `place` is 1-based. */
export function trophiesForPlace(prizes: PrizeBag, place: number, legacyTrophyId?: string | null): string[] {
  const all = placesOf(prizes, legacyTrophyId);
  return all[place - 1] ?? [];
}

/** Every trophy on the podium, flattened — for "what does this cost us". */
export const allPrizeTrophies = (prizes: PrizeBag, legacyTrophyId?: string | null): string[] =>
  [...new Set(placesOf(prizes, legacyTrophyId).flat())];

/**
 * Build the stored shape from a form.
 *
 * Always emits `places`, and always ALSO emits first/second/third for the top
 * three. Not belt-and-braces: several readers still exist that have not been
 * moved yet — a card renderer, a brand report — and a challenge saved by the
 * new builder must not lose its podium on a screen nobody remembered to update.
 * The duplicate is derived at write time from the same source, so the two
 * cannot disagree.
 */
export function toPrizeBag(places: string[][]): Record<string, unknown> {
  const norm = places.slice(0, MAX_PLACES).map(clean);
  while (norm.length && !norm[norm.length - 1].length) norm.pop();
  return {
    places: norm,
    first: norm[0] ?? [],
    second: norm[1] ?? [],
    third: norm[2] ?? [],
  };
}

/** "Top 3", "Winner takes all", "Top 10" — how a podium is described. */
export function podiumLabel(prizes: PrizeBag, legacyTrophyId?: string | null): string {
  const n = payingPlaces(prizes, legacyTrophyId);
  if (n === 0) return "No trophies set";
  if (n === 1) return "Winner takes all";
  return `Top ${n}`;
}
