// What this product used to have, and no longer does. B112.
//
// ===== WHY THIS FILE EXISTS =====
//
// Twice now, a wrong statement about the product has been written into
// user-facing copy and into the plan, by the same mechanism both times:
//
//   1. "Brands are billed on impressions." They are billed a **fixed price per
//      challenge**. CPM was the V1 ad-network model the due-diligence review
//      destroyed. It reached `components/CookieConsent.tsx` and
//      `app/legal/cookies/page.tsx` — legal copy — before the owner caught it.
//   2. "Following, messaging and gifting stay." **Gifting was deleted in
//      B72.3**, because a transfer of redeemable value between two accounts is
//      a money-transmission trigger, a 1099 aggregation hole and an under-18
//      cash-out bypass at once. It reached `docs/PLAN.md` and a commit message.
//
// Neither was a typo and neither was a code defect. **The code was right both
// times.** Both came from reading a document written before the change and
// repeating its words as a statement of fact about today — and `docs/legacy/`
// is full of documents like that, because that is what the folder is for.
//
// A person cannot be trusted to remember which of forty documents predates
// which of a hundred and twelve changes. So the list is here, in code, and
// `tests/db/docs-truth.mts` reads it.
//
// ===== THE RULE =====
//
// A live document may DISCUSS a retired feature — the history is the reason
// nobody rebuilds it — but every mention must sit beside an acknowledgement
// that it is gone. A mention with no acknowledgement nearby is, by
// construction, somebody describing it as a feature.
//
// ===== ADDING TO THIS LIST =====
//
// When you delete a feature, add it here in the same commit. The `evidence`
// field is not decoration: it is the file a reader checks when they do not
// believe the entry, and the test asserts that file still says what the entry
// claims.

export type Retired = {
  /** The word or phrase a stale document would use. */
  what: string;
  /** Every spelling worth catching, as a regex source (case-insensitive). */
  pattern: string;
  /** Strings that mean "this mention is about the removal", not a claim. */
  cleared: string[];
  /** Where it went, so the entry can be checked rather than believed. */
  evidence: string;
  /** A fragment that must still appear in `evidence`. */
  evidenceSays: string;
  /** Why it went. The part that stops somebody rebuilding it. */
  why: string;
};

export const RETIRED: Retired[] = [
  {
    what: "gifting a trophy to another account",
    pattern: "\\bgift(?:ing|ed|s)?\\b",
    // "gift card" is a payout method and entirely alive — Tremendous sends one.
    cleared: ["B72.3", "B111.1", "delet", "removed", "retired", "money-transmission",
      "money transmission", "no longer", "does not exist", "⚠", "out of date",
      "True when written", "no gift"],
    evidence: "lib/marketplace.ts",
    evidenceSays: "B72.3 deleted gifting outright",
    why: "A transfer of redeemable value between two people is a money-transmission trigger, a 1099 aggregation hole and an under-18 cash-out bypass at once. One deletion closed all three.",
  },
  {
    what: "billing a brand on impressions or CPM",
    pattern: "\\bCPM\\b|cost per thousand|per thousand impressions|billed on impressions|pay per impression",
    cleared: ["B81", "B104.1", "not a media CPM", "delet", "removed", "retired",
      "no longer", "superseded", "⚠", "never billed", "not how", "used to"],
    evidence: "lib/challenge-billing.ts",
    evidenceSays: "unitAmount",
    why: "A brand pays a fixed price for a sponsored challenge. Impressions are DELIVERY EVIDENCE — proof we ran what we sold — and generate no invoice line. The invoice is quantity: challenges × unitAmount: challengePrice.",
  },
  {
    what: "posts, comments and reactions",
    pattern: "\\b(?:post feed|community feed|comment thread|post reaction|write a post)\\b",
    cleared: ["B111", "B68", "delet", "removed", "retired", "no longer", "⚠", "used to", "purge"],
    evidence: "lib/social-purge.ts",
    evidenceSays: "SOCIAL_TABLES",
    why: "Cluster is a competition and earning layer, not a social network. The feed was the part nobody used and everybody had to moderate.",
  },
  {
    what: "the placements / reach / ultimate pricing tiers",
    pattern: "reach base|placements base|ultimate base|challenge base",
    cleared: ["C11", "B110", "retired", "removed", "delet", "no longer", "⚠", "used to", "0"],
    evidence: "lib/pricing.ts",
    evidenceSays: "C11 — retired",
    why: "One package, priced per challenge. `reachBase`, `challengeBase` and `ultimateBase` are all 0.",
  },
];

/** Live documents. Anything under `docs/legacy/` is history and exempt by design. */
export const LIVE_DOCS = [
  "README.md",
  "docs/PLAN.md",
  "docs/MODEL.md",
  "docs/HANDOVER.md",
  "docs/ARCHITECTURE.md",
  "docs/OPERATIONS.md",
  "docs/SETUP.md",
  "docs/PAYMENTS.md",
];

/**
 * SAME LINE. Not a window.
 *
 * This started at eight lines, then three, and BOTH let the real defect
 * through. Re-introducing the exact sentence that shipped —
 * "Following, messaging, gifting, planets and their membership" — passed at
 * three, because the paragraph above it happened to contain the word "deleted"
 * about something else entirely. A proximity rule cannot tell an
 * acknowledgement of THIS mention from an unrelated one nearby, and the more
 * carefully a document explains a deletion the more words it leaves lying
 * around to excuse the next wrong sentence.
 *
 * So the acknowledgement has to be attached to the mention: on the same line.
 * A deliberate quote of a dated document is still allowed — it just has to say
 * so, with `RETIRED_QUOTE` on the line or the one above it.
 */
export const CLEAR_SAME_LINE = true;

/**
 * The opt-out, for quoting a document that was true when it was written.
 *
 * Explicit and ugly on purpose. `docs/PLAN.md` quotes B68's brief — which says
 * gifting stays — because the quote is the point of the entry. Marking it costs
 * one comment; leaving the rule loose enough to allow it unmarked cost two
 * shipped errors.
 */
export const RETIRED_QUOTE = "<!-- retired-quote -->";

/** Mentions that are a different thing wearing the same word. */
export const NOT_A_MENTION = /gift\s?cards?|giftcard|gifting one moved/i;
