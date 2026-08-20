// The refusal, and it exists before any editor does.
//
// ===== WHY THIS IS FIRST AND NOT LAST =====
//
// `14-EDITABLE` §1. Until this sprint, house rule 2 — *import numbers, never
// retype them* — was enforced by `tests/band1/03-copy.test.ts` and
// `97-copy-rule.test.ts`, and **both work by walking source files**. They can
// only see strings a deploy put there.
//
// The moment an operator can type copy into a database, every one of those
// guards stops covering the strings that actually render. Somebody types
// *"$700 a challenge"* into a content key, it is live, it is wrong, and the
// whole band stays green because no test file changed.
//
// So an editor built before this validator is not an incomplete feature. It is
// a live, unguarded way to publish a wrong number, at the exact moment the
// existing protection goes dark. And it is not hypothetical: it is the failure
// this entire branch was created after — **a document quoting an owner's
// withdrawal floor at twice its real value.** It was not lying. It was a copy
// of a number that had moved.
//
// ===== E2 — A REFUSAL THAT ONLY SAYS NO GETS WORKED AROUND =====
//
// Every refusal below names the alternative, and where it can it names the
// exact key that already carries that figure correctly. An operator who is
// told "no figures" and not told what to write instead will write the figure
// into a key this does not check, or into a page, or into an email.
//
// ===== AND THE HALF THAT MAKES THE OTHER FOUR MEAN ANYTHING =====
//
// A validator whose body is `return refuse()` passes E1, E2, E3 and E4. So the
// contract is two-sided and the guard asserts both: **a legitimate sentence
// with a `{placeholder}` in it is accepted.** That is the shape copy is meant
// to take — `SAYS` fills the placeholder from the module that enforces the
// figure — and refusing it would be refusing the answer.

import {
  CHALLENGE_PRICE_CENTS,
  COMMUNITY_TIERS,
  DEFAULT_SPLIT_BPS,
  KPI_WEIGHTS,
} from "../money/amounts.ts";
import {
  attributionSentence,
  attributionShort,
  RULE_PHRASES,
} from "../identity/attribution.ts";

export type CopyCheck =
  | { ok: true }
  | {
      ok: false;
      /** What is wrong, in a sentence an operator can act on. */
      reason: string;
      /** What to write instead. Never null — E2. */
      alternative: string;
      /** Which rule refused it, so a guard can assert the right one fired. */
      rule: "currency" | "percentage" | "threshold" | "rule-in-words";
    };

/**
 * The figures the product decides, and the key that already carries each.
 *
 * Matched against what was typed so the refusal can name the **exact** key
 * rather than the category. Typing "$350" is not a generic mistake — it is a
 * copy of `CHALLENGE_PRICE_CENTS`, and saying so is the difference between a
 * refusal somebody acts on and one they route around.
 *
 * Derived, not typed: every pattern is built from the module's own value at
 * module load. A price change makes this name the new number automatically,
 * which is the entire point of the rule it enforces.
 */
function knownFigures(): { pattern: RegExp; what: string; use: string }[] {
  const dollars = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, "");
  const money = (cents: number) =>
    new RegExp(`\\$\\s?${dollars(cents).replace(".", "\\.")}\\b`);
  const pct = (bps: number) => new RegExp(`\\b${bps / 100}\\s?%`);

  return [
    {
      pattern: money(CHALLENGE_PRICE_CENTS),
      what: "the challenge price",
      use: "{price}, filled by SAYS.unitPrice from CHALLENGE_PRICE_CENTS",
    },
    {
      pattern: money(COMMUNITY_TIERS[1].prizeCents),
      what: "a community tier prize",
      use: "{prize}, filled from COMMUNITY_TIERS",
    },
    {
      pattern: money(COMMUNITY_TIERS[2].prizeCents),
      what: "a community tier prize",
      use: "{prize}, filled from COMMUNITY_TIERS",
    },
    {
      pattern: pct(DEFAULT_SPLIT_BPS.prize),
      what: "the prize share of the vault split",
      use: "SAYS.prizeShare, which reads DEFAULT_SPLIT_BPS",
    },
    {
      pattern: pct(DEFAULT_SPLIT_BPS.server),
      what: "the server share of the vault split",
      use: "SAYS.prizeShare, which reads DEFAULT_SPLIT_BPS",
    },
    {
      // Anchored to the percent sign, not to the bare number. `KPI_WEIGHTS`
      // holds plain integers, and a pattern matching a bare "40" would refuse
      // any sentence containing the number forty — which is the
      // refuse-everything failure the negative half of this guard exists to
      // catch. The `%` is what makes it a claim about a weight.
      pattern: new RegExp(`\\b${KPI_WEIGHTS.entrants}\\s?%`),
      what: "a KPI weight",
      use: "SAYS.kpis, which reads KPI_WEIGHTS",
    },
  ];
}

const CURRENCY = [
  /[$£€]\s?\d/,
  /\b\d[\d,]*(\.\d+)?\s*(dollars?|usd|cents?|pounds?|euros?|quid)\b/i,
];

const PERCENTAGE = [/\d\s?%/, /\b\d[\d.]*\s*per\s?cent\b/i];

/**
 * A threshold is a number with a comparison attached.
 *
 * A bare number is **not** refused, deliberately. "Monday 00:00 UTC" and "one
 * game, one week" are copy, and a validator that cannot tell them from a floor
 * refuses everything — which passes E1 through E4 while making the editor
 * useless, and an editor nobody can use is an editor that gets bypassed.
 */
const THRESHOLD = [
  /\b(at least|at most|no more than|no fewer than|minimum of|maximum of|more than|fewer than|less than|up to|over|under|from)\s+\d/i,
  /\b\d[\d,]*\s*(or more|or fewer|or above|or below|minimum|maximum|\+)\b/i,
];

/**
 * The rules this platform states in words, and which module owns each.
 *
 * E3/N3 — *"an operator may not type the attribution sentence any more than a
 * component may."* The phrases are taken from what the module actually
 * produces, so a change to the rule cannot leave this checking for words
 * nobody says any more — the same construction `97-copy-rule` uses, and for
 * the same reason.
 */
function ruleWordings(): { phrases: readonly string[]; what: string; use: string }[] {
  // Imported, never typed. A copy of this list in this file would itself be a
  // rendered surface stating the deleted model — which is what `97-copy-rule`
  // said the first time it was written that way, correctly.
  return [
    {
      phrases: RULE_PHRASES,
      what: "how a server earns from one gamer",
      use: "SAYS-side text generated by attributionSentence() — the module that enforces the rule owns its words",
    },
  ];
}

/**
 * May this string be saved as copy?
 *
 * `key` is only used to name it back in the refusal. Nothing about the answer
 * depends on which key it is: a figure is wrong in every key, and a per-key
 * exemption is a hole with a name.
 */
export function checkCopy(key: string, value: string): CopyCheck {
  const text = String(value ?? "");

  // ===== PLACEHOLDERS ARE THE ANSWER, SO THEY ARE READ FIRST =====
  //
  // `{price}` carries no digits, so it would pass anyway — but stripping them
  // explicitly means a placeholder can never be the thing that trips a rule,
  // and it makes the intent legible rather than accidental.
  const withoutPlaceholders = text.replace(/\{[a-zA-Z0-9_]+\}/g, " ");

  const named = knownFigures().find((f) => f.pattern.test(withoutPlaceholders));
  if (named) {
    return {
      ok: false,
      rule: CURRENCY.some((p) => p.test(withoutPlaceholders)) ? "currency" : "percentage",
      reason: `“${key}” states ${named.what}. That figure is set in one place, and a copy of it goes stale the day it moves.`,
      alternative: `Use ${named.use} and it will always be right.`,
    };
  }

  if (CURRENCY.some((p) => p.test(withoutPlaceholders))) {
    return {
      ok: false,
      rule: "currency",
      reason: `“${key}” contains a currency amount. Copy carries no figures at all — every price on this platform comes from lib/money/amounts.ts.`,
      alternative:
        "Write the sentence with a {placeholder} and add it to SAYS, which takes its figure from the module that enforces it.",
    };
  }

  if (PERCENTAGE.some((p) => p.test(withoutPlaceholders))) {
    return {
      ok: false,
      rule: "percentage",
      reason: `“${key}” contains a percentage. A share that is typed is a share that disagrees with the split the day somebody changes it.`,
      alternative:
        "Write the sentence with a {placeholder} and add it to SAYS — DEFAULT_SPLIT_BPS and KPI_WEIGHTS are the modules that hold these.",
    };
  }

  if (THRESHOLD.some((p) => p.test(withoutPlaceholders))) {
    return {
      ok: false,
      rule: "threshold",
      reason: `“${key}” states a threshold. A threshold quoted in copy is exactly the failure this platform was rebuilt after — a document had an owner's withdrawal floor at twice its real value.`,
      alternative:
        "Write the sentence with a {placeholder} and add it to SAYS. The thresholds live in lib/money/amounts.ts and lib/pool/eligibility.ts.",
    };
  }

  const lower = withoutPlaceholders.toLowerCase();
  for (const rule of ruleWordings()) {
    const hit = rule.phrases.find((p) => p && lower.includes(p.toLowerCase()));
    if (hit) {
      return {
        ok: false,
        rule: "rule-in-words",
        reason: `“${key}” states ${rule.what} in words. N3 — a sentence that states a rule is generated from the module that enforces the rule, never typed.`,
        alternative: `Use ${rule.use}.`,
      };
    }
  }

  return { ok: true };
}

/** The whole refusal as one line, for a form that has one place to put it. */
export function refusalText(check: CopyCheck): string | null {
  return check.ok ? null : `${check.reason} ${check.alternative}`;
}
