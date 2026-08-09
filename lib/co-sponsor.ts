// Two brands on one challenge. B101.
//
// ===== WHY TWO, AND WHY NOT A LIST =====
//
// A co-sponsored challenge is two brands putting their names on the same
// competition — a game publisher and an energy drink, a hardware brand and a
// tournament organiser. It is a real deal shape and the owner asked for it
// explicitly, with a ceiling: **at most two.**
//
// So it is a second COLUMN, not an array. A `brand_ids jsonb[]` would make
// "three brands" representable and then need a check constraint, a validator,
// and a test for the day somebody wrote four. A nullable `co_sponsor_brand_id`
// makes the invalid state impossible to store, which is cheaper than making it
// illegal to write.
//
// The lead brand stays `sponsor_brand_id` and nothing about a single-brand
// challenge changes. Every existing read — the card, the billing panel, the
// campaign — keeps working untouched, and the co-sponsor is additive.
//
// ===== THE BILLING RULE, WHICH IS THE POINT =====
//
// A co-sponsored challenge is **not paid until both brands have paid.** That is
// not pedantry: running it on one brand's money while the other's logo is on it
// means the first brand funded the second's exposure, and they would be right
// to be angry about it. `billFor` reads both.
//
// The split is 50/50 by default and stored as the price each brand owes, so a
// deal where one brand pays 70% is a number in a field rather than a special
// case in code.

/** The ceiling the owner set. Two names on a card is a collaboration; five is a logo wall. */
export const MAX_SPONSORS = 2;

export type SponsorInput = {
  sponsorBrandId?: string | null;
  coSponsorBrandId?: string | null;
};

/**
 * Every brand on this challenge, lead first, with no gaps and no duplicates.
 *
 * Derived rather than stored: the alternative is a `sponsorCount` that can
 * disagree with the columns, and it would, on the first challenge where
 * somebody cleared the co-sponsor without touching it.
 */
export function sponsorsOf(c: SponsorInput): string[] {
  const out: string[] = [];
  for (const id of [c.sponsorBrandId, c.coSponsorBrandId]) {
    const v = (id ?? "").trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, MAX_SPONSORS);
}

export const isCoSponsored = (c: SponsorInput): boolean => sponsorsOf(c).length > 1;

export type CoSponsorCheck = { ok: true; coSponsorBrandId: string | null } | { ok: false; error: string };

/**
 * May this challenge take this co-sponsor?
 *
 * Pure, so the rule is testable without a database and reads the same in the
 * admin form as in the action that saves it.
 */
export function checkCoSponsor(lead: string | null | undefined, co: unknown): CoSponsorCheck {
  const v = typeof co === "string" ? co.trim() : "";
  // Clearing it is always allowed. A co-sponsor who pulled out must be
  // removable without unpicking the whole challenge.
  if (!v) return { ok: true, coSponsorBrandId: null };
  if (!lead) {
    return {
      ok: false,
      error: "Pick the lead brand first. A co-sponsor is the second name on the challenge, not the only one.",
    };
  }
  if (v === lead) {
    return {
      ok: false,
      error: "That is already the lead brand. A co-sponsored challenge needs two different brands.",
    };
  }
  return { ok: true, coSponsorBrandId: v };
}

/**
 * What each brand owes, given a total and an optional lead share.
 *
 * `leadPct` is the lead brand's percentage; the co-sponsor takes the rest. It
 * exists because 50/50 is the default and not the rule — a publisher putting up
 * the prize money while a drink brand puts up a logo is a 70/30 deal, and that
 * belongs in a field rather than in a comment explaining why the numbers look
 * odd.
 *
 * Rounded so the two halves always add back to the total. Splitting $250.01
 * evenly and rounding both ways loses a cent, and a cent that vanishes from an
 * invoice is a support ticket from somebody's finance department.
 */
export function splitBill(total: number, leadPct = 50): { lead: number; co: number } {
  const t = Math.round(Number(total || 0) * 100) / 100;
  const pct = Math.min(100, Math.max(0, Number(leadPct)));
  const lead = Math.round(t * (pct / 100) * 100) / 100;
  return { lead, co: Math.round((t - lead) * 100) / 100 };
}
