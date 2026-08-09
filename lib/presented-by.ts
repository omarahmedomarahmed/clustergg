import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { sponsorsOf, type SponsorInput } from "@/lib/co-sponsor";

// The line a gamer reads. B107.
//
// ===== THE GAP THIS CLOSES =====
//
// B101 gave a challenge two brands. It gave them a column, a validator, a
// 50/50 split and a billing rule that will not announce until BOTH have paid.
// It gave them no place where a gamer reads two names.
//
// That is the wrong half to have built. What a brand buys is their name in
// front of the people playing; the invoice is how they pay for it. We had the
// invoice working perfectly and the thing it bought did not exist — a
// co-sponsored challenge looked, to every single person who saw it, exactly
// like a challenge with one sponsor, and the second brand paid half the bill
// for nothing.
//
// The only place a brand name reached a gamer at all was the weekly Discord
// recap, and it INNER JOINed the lead brand — so the co-sponsor was not merely
// unmentioned, it was structurally impossible to mention.
//
// ===== WHY THIS IS ITS OWN FILE =====
//
// Because four surfaces have to say the same thing: the challenge page, the
// Discord launch/ending/result announcements, the weekly recap, and the OG
// preview. Four call sites writing their own `${a} and ${b}` is four chances
// to disagree about ordering, about what happens when the co-sponsor is
// deleted, and about whether a house brand counts.
//
// The lead is always first. Not alphabetical, not by amount paid: the lead
// brand is the one on `sponsor_brand_id`, that is what the deal says, and a
// line that reorders itself when somebody edits a price is a line we would
// have to explain.
//
// ===== WHAT IS NOT HERE =====
//
// No logos. Two brand images side by side is a layout problem on four
// surfaces, three of which are Satori, and the honest first version of this
// is the names. `brandLogos` exists below for the day the layout does.

/** The words in front of the names. One string, so it is translated once. */
export const PRESENTED_BY = "Presented by";

/**
 * "Ace Energy and Northwind" — or "Ace Energy" — or "".
 *
 * Empty for an unsponsored challenge, deliberately: the caller renders nothing
 * rather than "Presented by nobody". Every surface below checks for the empty
 * string, which is why this returns one instead of null.
 */
export function joinNames(names: string[]): string {
  const clean = names.map((n) => (n ?? "").trim()).filter(Boolean);
  if (!clean.length) return "";
  if (clean.length === 1) return clean[0];
  // "and", not "&" or a comma. Two brands who paid to appear together read as
  // partners; a comma reads as a list of logos.
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

/** The whole line, ready to print. Empty when there is nothing to say. */
export function presentedBy(names: string[]): string {
  const joined = joinNames(names);
  return joined ? `${PRESENTED_BY} ${joined}` : "";
}

export type Presenter = { id: string; name: string; slug: string | null; logoUrl: string | null };

/**
 * The brands on one challenge, lead first, resolved to names.
 *
 * `sponsorsOf` decides WHICH ids and in what order — this file does not repeat
 * that rule, it looks up what that rule returned. A brand id pointing at a row
 * that no longer exists is dropped rather than rendered as a gap, because a
 * deleted brand is not a sponsor.
 */
export async function presentersOf(c: SponsorInput): Promise<Presenter[]> {
  const ids = sponsorsOf(c);
  if (!ids.length) return [];
  try {
    const db = await getDb();
    const rows = await db.select({
      id: schema.brands.id,
      name: schema.brands.name,
      slug: schema.brands.slug,
      logoUrl: schema.brands.logoUrl,
    }).from(schema.brands).where(inArray(schema.brands.id, ids));
    // Ordered by `ids`, not by whatever the database returned. The lead is
    // first because the deal says so.
    return ids
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is Presenter => !!r && !!r.name);
  } catch {
    // A brand lookup failing must never take down a challenge page. No line is
    // a worse page; a 500 is no page.
    return [];
  }
}

/**
 * The same thing for many challenges at once, in one query.
 *
 * The weekly recap and the feed both render a list, and `presentersOf` in a
 * loop is the N+1 that this codebase keeps having to remove. Returns a map from
 * challenge id to its presenters, lead first.
 */
export async function presentersFor(
  challenges: (SponsorInput & { id: string })[],
): Promise<Map<string, Presenter[]>> {
  const out = new Map<string, Presenter[]>();
  const wanted = new Set<string>();
  for (const c of challenges) for (const id of sponsorsOf(c)) wanted.add(id);
  if (!wanted.size) return out;
  try {
    const db = await getDb();
    const rows = await db.select({
      id: schema.brands.id,
      name: schema.brands.name,
      slug: schema.brands.slug,
      logoUrl: schema.brands.logoUrl,
    }).from(schema.brands).where(inArray(schema.brands.id, [...wanted]));
    const byId = new Map(rows.map((r) => [r.id, r as Presenter]));
    for (const c of challenges) {
      const list = sponsorsOf(c).map((id) => byId.get(id)).filter((r): r is Presenter => !!r && !!r.name);
      if (list.length) out.set(c.id, list);
    }
    return out;
  } catch { return out; }
}

/** Convenience: the finished line for one challenge, or "". */
export async function presentedByLine(c: SponsorInput): Promise<string> {
  return presentedBy((await presentersOf(c)).map((p) => p.name));
}

/**
 * The logos, for the day a surface has room for them.
 *
 * Not used yet, and deliberately exported anyway: it is the piece somebody will
 * reach for, and having it derive from the same ordering as the names is the
 * difference between two surfaces that agree and two that nearly agree.
 */
export const brandLogos = (list: Presenter[]): string[] =>
  list.map((p) => p.logoUrl ?? "").filter(Boolean);

/**
 * Is this challenge's sponsor line safe to publish yet?
 *
 * A name goes public when the challenge is announced, and announcing is already
 * gated on the bill being paid (`lib/challenge-billing.ts`). So this asks the
 * one question that gate does not: has this challenge actually been announced?
 * A draft challenge's page is reachable by id, and printing an unpaid brand's
 * name on it is exposure they have not bought.
 */
export async function publishableSponsors(challengeId: string): Promise<boolean> {
  try {
    const db = await getDb();
    const [row] = await db.select({ status: schema.challenges.status })
      .from(schema.challenges)
      .where(and(eq(schema.challenges.id, challengeId)))
      .limit(1);
    return !!row && row.status !== "draft";
  } catch { return false; }
}
