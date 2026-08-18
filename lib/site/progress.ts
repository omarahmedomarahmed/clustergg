// Progress bars — H3, and the rule underneath them that matters more.
//
// ===== H3 SAYS WHERE. H4 SAYS WHAT A BAR MAY NEVER COUNT =====
//
//   H3 — "Progress bars on every gated thing: onboarding, server profile,
//        pool eligibility, challenge lifecycle."
//   H4 — "**Never** a progress bar on raw member count — that advertises the
//        wrong number to optimise."
//
// H4 is not a styling preference. A bar is the most persuasive thing on a
// page: it says *this is the number, and you are this far along it*. Put one
// on a member count and every owner reads it as the instruction, which is the
// exact opposite of K4/K5 — the KPIs measure outcomes on our platform, and a
// server that inflates its head count without entrants **lowers** its score.
//
// ===== SO THE POOL BAR COUNTS THE PROFILE, AND THE GATE IS PROSE =====
//
// The gate has two halves — `linked ≥ 10` **and** a complete profile — and
// only one of them is a set of steps the owner controls by doing them. 12 §5
// writes the answer out in the shape it wants:
//
//     "4 of 6 done · 6 more linked gamers to unlock the pool."
//
// A bar over six profile fields, and the head count **beside it in words.**
// `poolEligibilityProgress` therefore reads the profile and nothing else, and
// `unlockNote` carries the rest. The bar can read 100% while the server is
// still not eligible, and that is correct rather than a bug to smooth over:
// the bar is not a proxy for the gate, it is the half they can finish today.

import type { ProfileCompleteness, EligibilityReading } from "../pool/eligibility.ts";
import { LINKED_MEMBERS_TO_UNLOCK_POOL } from "../pool/eligibility.ts";
import type { ChallengeState } from "../challenges/lifecycle.ts";
import { STATES } from "../challenges/lifecycle.ts";

/**
 * One bar. The same shape `lib/identity/onboarding.ts` already returns, so the
 * component that draws it has one input type and not four.
 */
export type Progress = {
  /** How many steps of this thing are done. */
  done: number;
  /** How many there are. */
  total: number;
  /** 0–100. */
  percent: number;
  /** `4 of 6 done` — the shape 12 §5 asks for. */
  label: string;
  /**
   * What this bar counts, in words, for the person reading it.
   *
   * Not decoration: a bar with no stated subject is a bar whose subject can
   * quietly change, which is how H4 gets broken by an edit that looks like a
   * refactor.
   */
  subject: string;
};

function bar(done: number, total: number, subject: string): Progress {
  const percent = total === 0 ? 100 : Math.round((done / total) * 100);
  return { done, total, percent, label: `${done} of ${total} done`, subject };
}

/**
 * The server profile — six fields, from the same `profileCompleteness` the gun
 * and the registry read. 12 §5.
 */
export function profileProgress(completeness: ProfileCompleteness): Progress {
  return bar(completeness.done, completeness.total, "profile fields");
}

/**
 * Pool eligibility. **H4 lives here.**
 *
 * Takes the whole reading — including `linkedMembers` — and deliberately puts
 * none of it in the bar. Handing this function only the profile would make the
 * rule impossible to break *and impossible to prove*: the guard needs a
 * function that could have counted the head count and does not.
 */
export function poolEligibilityProgress(reading: EligibilityReading): Progress {
  return bar(reading.profile.done, reading.profile.total, "profile fields");
}

/**
 * The half of the gate that is **not** a bar — the sentence beside it.
 *
 * Null when there is nothing left to say, so a complete server does not read
 * "0 more linked gamers", which is a true sentence nobody wants.
 */
export function unlockNote(reading: EligibilityReading): string | null {
  const short = LINKED_MEMBERS_TO_UNLOCK_POOL - reading.linkedMembers;
  if (short <= 0) return null;
  return `${short} more linked gamer${short === 1 ? "" : "s"} to unlock the pool`;
}

/**
 * E2's two states, put into a sentence. **The states themselves are computed
 * in one place and it is not here** — `poolStatesFor` in
 * `lib/pool/eligibility.ts`, which the registry already reads. This takes its
 * answer and says it; a second reading of the gate is the drift `01-CYCLE`'s
 * one-function rule forbids.
 *
 * All four combinations are real, and the interesting one is *in this week,
 * not on track for next*: E3 means this week is already safe, and an owner who
 * saw only "not eligible" would think they had lost money they have in fact
 * already earned.
 */
export function poolStandingHeadline(states: {
  inThisWeeksPool: boolean;
  onTrackForNextWeek: boolean;
}): string {
  if (states.inThisWeeksPool) {
    return states.onTrackForNextWeek
      ? "In this week's pool, and on track for next week."
      : "In this week's pool — this week is safe, because eligibility is never " +
          "re-checked mid-week. Not on track for next week yet.";
  }
  return states.onTrackForNextWeek
    ? "Not in this week's pool — you were not eligible when Monday's gun fired. " +
        "On track for next week."
    : "Not in this week's pool, and not on track for next week yet.";
}

/**
 * The challenge lifecycle — 03 §1's six states, as a bar.
 *
 * Derived from the state alone, because the state is itself derived. `ended`
 * is 6 of 6 rather than a seventh "done" step: a closed challenge is finished,
 * not waiting for something.
 */
export function lifecycleProgress(state: ChallengeState): Progress {
  const index = STATES.indexOf(state);
  // An unknown state reads as nothing done rather than throwing — house rule
  // 11: a bar is decoration and may never take a page down.
  const done = index < 0 ? 0 : index + 1;
  return bar(done, STATES.length, "lifecycle stages");
}

/**
 * A milestone's live progress — T6/T7, *"3 of 5 challenges in League"*.
 *
 * Counted per gamer, over challenges **they** entered. Not a member count of
 * anybody else's, which is the whole of H4.
 */
export function milestoneProgress(done: number, target: number, noun: string): Progress {
  const capped = Math.min(done, target);
  return {
    ...bar(capped, target, noun),
    label: `${capped} of ${target} ${noun}`,
  };
}
