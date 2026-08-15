// The content store: every editable string, with a code-side default.
//
// C3 — all editable copy lives in one store with a default for every key.
// C4 — **a default must never state a number the product decides. It asks for
// it.** That is the rule this file is shaped by: there is not a single figure
// below. Where a sentence needs one it takes a parameter, and the parameter
// comes from `lib/money/amounts.ts` — the module that enforces it.
//
// The reason is a document that was found quoting an owner's withdrawal floor
// at twice its real value. It was not lying; it was a copy of a number that
// had moved. A default that cannot hold a number cannot go stale.

import { formatMoney, CHALLENGE_PRICE_CENTS, KPI_WEIGHTS } from "../money/amounts.ts";

export const COPY = {
  tagline:
    "An automated weekly gaming competition that runs inside the Discord " +
    "servers gamers already sit in.",
  noMachinery:
    "No bracket, no schedule, no lobby, no stream, no staff, no dispute — " +
    "the game's own API is the referee.",
  /** K7 in the truth doc: the homepage states this plainly. */
  discordTerms:
    "We reward outcomes, never Discord activity. Not commands, not messages, " +
    "not card opens — we respect Discord's terms, and every number here is " +
    "something that happened on our own platform.",
  poolIsPublic:
    "The pool is public on purpose. We do not buy entrants with advertising — " +
    "we make what each community earns visible, and the communities bring " +
    "their members.",
  gracePeriod: "The week has ended. Next week's challenges are below.",
} as const;

/** Sentences that need a figure take it. They never carry one. */
export const SAYS = {
  unitPrice: () =>
    `One challenge, one game, one week: ${formatMoney(CHALLENGE_PRICE_CENTS)}, billed individually.`,
  kpis: () =>
    `Servers are paid on three things: exclusive entrants (${KPI_WEIGHTS.entrants}), ` +
    `conversion (${KPI_WEIGHTS.conversion}) and activation (${KPI_WEIGHTS.activation}). ` +
    `A gamer in two servers is worth half to each, and an entrant who never ` +
    `plays lowers the score.`,
  prizeShare: (priceCents: number, prizeCents: number) =>
    `${formatMoney(priceCents)} buys a ${formatMoney(prizeCents)} prize pool.`,
} as const;
