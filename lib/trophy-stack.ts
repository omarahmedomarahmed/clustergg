// The stacking rule, and nothing else. B62.1.
//
// Its own module because `components/TrophyCase.tsx` is a client component and
// `lib/trophies.ts` imports Drizzle and the whole schema. Pulling that into the
// browser bundle to reuse one `reduce` would be a poor trade — and writing the
// `reduce` twice instead is how the bot card and the web ended up disagreeing
// about the same gamer's shelf in the first place.
//
// No imports at all, so it is also testable without a database.

/** The least a thing needs to be stackable. `TrophyAward` satisfies it. */
export type StackableAward = {
  id: string;
  name: string;
  imageUrl: string;
  value: number;
  awardedAt: string;
};

/**
 * The same trophy, held more than once, is ONE tile with a count. B62.1.
 *
 * A gamer can hold the same trophy several times over — bought one, won one in
 * a challenge, earned one at a streak milestone. Drawn one row per award that
 * is three identical pictures in a row, which reads as a rendering bug rather
 * than an achievement. **The count is the impressive part.**
 *
 * ===== WHY THIS FUNCTION EXISTS RATHER THAN THREE COPIES OF A `reduce` =====
 *
 * The bot card already stacked (`lib/cards/data.ts`) and the two web surfaces
 * did not, so the same gamer's shelf looked like a different shelf depending on
 * where you saw it. Grouping the same way in three places is three chances to
 * pick a different key — and the key is the whole decision here.
 *
 * ===== THE KEY IS name + image, NOT trophyId =====
 *
 * Deliberately the same key the card has always used. Two `trophies` rows can
 * be the same trophy to a person — staff duplicating one for a second brand,
 * or a re-issue — and a gamer looking at two identical pictures does not care
 * that they carry different ids. Grouping on `trophyId` would leave exactly the
 * duplicate-looking tiles this exists to remove.
 *
 * ===== WHAT IS KEPT FROM THE GROUP =====
 *
 * The newest award's details, because that is the one a gamer just earned and
 * the one they are looking for. `ids` carries EVERY award in the stack, so a
 * caller that has to act on them individually — the redeem flow selects
 * per-award — can still do so without regrouping. `awards` carries the rows
 * themselves for the same reason: `TrophyCase` needs each one's status to know
 * which copies in a stack are actually redeemable.
 */
export type TrophyStack<T extends StackableAward = StackableAward> = T & {
  /** How many of this trophy are in the stack. Always ≥ 1. */
  count: number;
  /** Every award id in the stack, newest first. */
  ids: string[];
  /** Every award in the stack. Statuses differ — one copy can be mid-payout. */
  awards: T[];
  /** A stable key for React, and the grouping key itself. */
  key: string;
  /** What the whole stack redeems for. Zero when none of it is redeemable. */
  stackValue: number;
};

export function stackTrophies<T extends StackableAward>(awards: T[]): TrophyStack<T>[] {
  const by = new Map<string, TrophyStack<T>>();
  for (const a of awards) {
    const key = `${a.name}::${a.imageUrl}`;
    const hit = by.get(key);
    if (!hit) {
      by.set(key, { ...a, key, count: 1, ids: [a.id], awards: [a], stackValue: a.value });
      continue;
    }
    hit.count += 1;
    hit.ids.push(a.id);
    hit.awards.push(a);
    hit.stackValue += a.value;
    // Newest wins the visible details. `getTrophyCase` returns newest first, so
    // the first one seen is already the newest — but a caller that filtered or
    // re-sorted must not silently get the oldest challenge title.
    if (a.awardedAt > hit.awardedAt) {
      const { count, ids, awards, stackValue, key: k } = hit;
      by.set(key, { ...a, key: k, count, ids, awards, stackValue });
    }
  }
  return [...by.values()];
}

