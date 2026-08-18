// Domain objects → `CardSpec`. One place, read by every screen.
//
// ===== WHY THE SPECS ARE NOT IN THE SCREENS =====
//
// 01-CYCLE's one-function rule: *"every surface reads the same numbers from the
// same module. There is no second implementation of anything that decides
// money."* A standings card that formatted a score itself would be a second
// implementation of the score, and the bot is the surface most gamers see — so
// it is the worst place for one to drift.
//
// Every figure below arrives already computed. This module chooses words and
// order, and decides nothing.
//
// House rule 2 as well: not one figure is typed here. `formatMoney` is the
// module that knows what a cent looks like.

import { formatMoney } from "../money/amounts.ts";
import { STATE_LABEL, type ChallengeState } from "../challenges/lifecycle.ts";
import type { CardSpec } from "./render.ts";

/** How far into the week we are, in the words B4 asks for. */
export function daysLeftLine(endAt: Date, now: Date): string {
  const ms = endAt.getTime() - now.getTime();
  if (ms <= 0) return "Closed.";
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return days === 1 ? "Closes tomorrow." : `${days} days left.`;
}

export type ChallengeCardInput = {
  title: string;
  game: string;
  state: string;
  prizePoolCents: number;
  entrants: number;
  endAt: Date;
  imageUrl?: string | null;
  /** C27/C8 — a community challenge is always described as the server's. */
  community?: { serverName: string } | null;
};

export function challengeCard(input: ChallengeCardInput, now: Date): CardSpec {
  return {
    title: input.title,
    subtitle: input.community
      ? `A community challenge run by ${input.community.serverName}`
      : input.game,
    imageUrl: input.imageUrl ?? null,
    rows: [
      { label: "Prize pool", value: formatMoney(input.prizePoolCents) },
      { label: "Entrants", value: String(input.entrants) },
      { label: "Stage", value: STATE_LABEL[input.state as ChallengeState] ?? input.state },
    ],
    footer: daysLeftLine(input.endAt, now),
  };
}

export type StandingRow = { rank: number; name: string; points: number; matches: number };

/**
 * The standings card. **S4 — matches played is always shown**, whether or not
 * it scores, so a gamer can see the volume behind a score they are losing to.
 */
export function standingsCard(
  input: { title: string; rows: StandingRow[]; endAt: Date },
  now: Date,
): CardSpec {
  return {
    title: `${input.title} — standings`,
    subtitle: input.rows.length === 0 ? "Nobody has scored yet." : undefined,
    rows: input.rows.slice(0, 8).map((r) => ({
      label: `${r.rank}. ${r.name}`,
      value: `${r.points} pts · ${r.matches} matches`,
    })),
    footer: daysLeftLine(input.endAt, now),
  };
}

export function profileCard(input: {
  displayName: string;
  trophies: number;
  moneyCents: number;
  entries: number;
}): CardSpec {
  return {
    title: input.displayName,
    rows: [
      { label: "Trophies", value: String(input.trophies) },
      { label: "Worth cashing out", value: formatMoney(input.moneyCents) },
      { label: "Challenges entered", value: String(input.entries) },
    ],
    footer: "ClusterGG",
  };
}

/**
 * A trophy. **T3 — the participation trophy is one row with a holder count**,
 * never one per gamer, and that is a property of how it is counted rather than
 * of how this card chooses to draw it.
 */
export function trophyCard(input: {
  name: string;
  valueCents: number;
  holders: number;
  brandName?: string | null;
  imageUrl?: string | null;
}): CardSpec {
  return {
    title: input.name,
    subtitle: input.brandName ?? undefined,
    imageUrl: input.imageUrl ?? null,
    rows: [
      {
        label: "Worth",
        // V8 — a trophy with no dollar value is a collectable and touches the
        // prize vault not at all. Saying "$0" instead would invite the question
        // of where the nothing went.
        value: input.valueCents > 0 ? formatMoney(input.valueCents) : "A collectable",
      },
      { label: "Held by", value: `${input.holders} gamer${input.holders === 1 ? "" : "s"}` },
    ],
    footer: "ClusterGG · a showcase, not a shop",
  };
}

/** The server's own card — its pool position and what it has earned so far. */
export function serverCard(input: {
  name: string;
  thisWeekCents: number;
  position: number | null;
  of: number;
  inThisWeeksPool: boolean;
}): CardSpec {
  return {
    title: input.name,
    subtitle: input.inThisWeeksPool
      ? "In this week's pool"
      : "Not in this week's pool — the gate is read at Monday's gun",
    rows: [
      { label: "This week, so far", value: formatMoney(input.thisWeekCents) },
      {
        label: "Position",
        value: input.position ? `${input.position} of ${input.of}` : "Not scored",
      },
    ],
    footer: "Entrants earn. Winning a challenge earns your server nothing directly",
  };
}
