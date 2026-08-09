import { money, perGame, prizeSharePct, PRICING_DEFAULTS, type PricingConfig } from "@/lib/pricing";
import { challengeUnit } from "@/lib/finance";

// The deck stops typing prices. B110.
//
// ===== THE DEFECT, AND IT IS THE WORST KIND =====
//
// `/dataroom` told every reader, in its own words:
//
//   "Every figure in these documents is counted from production when you load
//    them. Nothing is modelled or projected."
//
// The investor deck under it said "a challenge runs every week for $250", "a
// brand pays $250… the $75 platform fee is the only line the business lives on,
// and EVERY TOTAL IN THIS DOCUMENT IS BUILT FROM IT", and "six games at $1,000
// a month".
//
// The live rate card in `lib/pricing.ts` is **$350** a challenge, of which
// **$175** is the prize — so the platform fee is **$175**, not $75. Per game
// per month is **$1,400**, not $1,000. The whole network is **$8,400** a month,
// not $6,400.
//
// The model itself was never wrong: `lib/finance.ts` derives price, prize and
// fee from `pricing` and always has. Only the PROSE was wrong — a sentence
// somebody typed once, against a rate card that later changed underneath it.
// That is exactly the failure `tests/db/marketing-truth.mts` was built to stop
// on the public pages, and the data room had no equivalent.
//
// Understating our own revenue is not the commercially dangerous direction. The
// dangerous part is different: an investor who opens `/pricing` in the next tab
// finds a document that contradicts the product, in a room whose front page
// promised the numbers were counted from production. That is the version of
// this that actually costs money.
//
// ===== WHY TOKENS RATHER THAN A REWRITE =====
//
// Retyping $350 where $250 was would be the same bug with a fresh date on it.
// The prose now carries `{{challengePrice}}` and the number arrives from the
// same config the rate card, the invoice and the finance model all read. A
// price change moves the deck with it, or it moves nothing and the alarm below
// fires.

export type TokenValues = Record<string, string>;

/**
 * Every token a document may use, resolved from the live rate card.
 *
 * Deliberately small. A token per sentence would be a templating language and
 * a maintenance problem; these are the numbers that appear in more than one
 * place and would drift in exactly one of them.
 */
export function pricingTokens(cfg: PricingConfig = PRICING_DEFAULTS): TokenValues {
  const unit = challengeUnit(cfg);
  const month = perGame(cfg);
  return {
    challengePrice: money(unit.price, cfg.currency),
    prizePool: money(unit.prize, cfg.currency),
    platformFee: money(unit.fee, cfg.currency),
    prizePct: `${prizeSharePct(cfg)}%`,
    challengesPerGame: String(cfg.challengesPerGame),
    games: String(cfg.games),
    perGameMonth: money(month, cfg.currency),
    networkMonth: money(month * cfg.games, cfg.currency),
  };
}

/**
 * The tokens this codebase knows how to fill.
 *
 * Exported so the drift alarm can assert that a document never uses one that
 * does not exist — an unfilled `{{price}}` printed to an investor is worse than
 * a stale number, because a stale number at least looks like a number.
 */
export const TOKEN_NAMES = Object.keys(pricingTokens());

const TOKEN_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Fill a document string.
 *
 * An UNKNOWN token is left exactly as written rather than blanked. A visible
 * `{{whatever}}` in a deck is embarrassing and gets fixed in an hour; a
 * silently empty sentence — "a brand pays  for a sponsored challenge" — reads
 * as a typo and survives for months.
 */
export function fillTokens(text: string | null | undefined, values: TokenValues): string {
  if (!text) return text ?? "";
  return text.replace(TOKEN_RE, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole);
}

/** Which tokens a string uses. Used by the alarm, and by the section editor's help. */
export function tokensIn(text: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const m of (text ?? "").matchAll(TOKEN_RE)) out.add(m[1]);
  return [...out];
}
