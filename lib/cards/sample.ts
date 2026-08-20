// The sample card a preview draws, and the one a save is checked against.
//
// ===== E10 — REFUSED AT SAVE, NOT DISCOVERED BY A GAMER =====
//
// *"A saved layout is asserted to still render before it goes live."* That
// assertion needs something to render, and it has to be a real spec: a layout
// that draws an empty object is a layout that renders fine and shows nothing.
//
// One sample, used by both the preview and the save check, for the same reason
// the preview uses the real renderer — a check that renders something the
// preview does not is a check that passes on a card nobody will ever see.
//
// The figures in it come from the money module. A sample card is still a
// rendered surface, and house rule 2 does not have an exception for examples.

import { formatMoney, CHALLENGE_PRICE_CENTS, COMMUNITY_TIERS } from "../money/amounts.ts";
import type { CardSpec } from "./render.ts";

/** A representative card for one family. */
export function sampleSpec(family: string): CardSpec {
  switch (family) {
    case "challenges":
      return {
        title: "Weekly Wins — Chess",
        subtitle: "Ends Friday 00:00 UTC",
        rows: [
          { label: "Prize pool", value: formatMoney(COMMUNITY_TIERS[2].prizeCents) },
          { label: "Entrants", value: "128" },
          { label: "Scoring", value: "Wins and matches. No win rate" },
        ],
        footer: "Join from any server with Cluster",
      };
    case "server":
      return {
        title: "Your server this week",
        subtitle: "Owner only — this card is never public",
        rows: [
          { label: "Earned so far", value: formatMoney(12_345) },
          { label: "Pool position", value: "4th of 61" },
        ],
        footer: "Every server's share is public at /pool",
      };
    case "trophies":
      return {
        title: "First place — Weekly Wins",
        subtitle: "Held by 1 gamer",
        rows: [
          { label: "Worth", value: formatMoney(10_000) },
          { label: "Cash out", value: "18+, a verified email, a country we can pay" },
        ],
        footer: "Podium is money. Turning up is a collectable",
      };
    default:
      return {
        title: "ClusterGG",
        subtitle: "One game, one week. You play the game you were going to play anyway",
        rows: [
          { label: "This week", value: "Live challenges and the countdown to Friday" },
          { label: "A challenge", value: formatMoney(CHALLENGE_PRICE_CENTS) },
          { label: "The pool", value: "What every server has earned, publicly" },
        ],
        footer: "We reward outcomes, never Discord activity",
      };
  }
}
