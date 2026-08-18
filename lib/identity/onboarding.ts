// Which onboarding path somebody is on, and how far through it they are.
//
// ===== THE PATH IS A PREFERENCE, NOT A FACT ABOUT THE PERSON =====
//
// It lives in a cookie rather than on `users`. I9 — *"either path always says
// they can be the other one too, at any time"* — so a stored path would be a
// claim that goes stale the moment somebody changes their mind, and we would
// then have a column disagreeing with what they are actually doing.
//
// What IS stored is what they told us: age band, country, a linked account, a
// granted scope. The path only decides which of those we ask for next.

import { cookies } from "next/headers";
import type { OnboardingPath, UnlockState } from "./unlock.ts";
import { ONBOARDING_PATHS, stepsFor } from "./unlock.ts";

export const ONBOARDING_PATH_COOKIE = "cluster_onboarding_path";

export async function currentPath(): Promise<OnboardingPath | null> {
  const value = (await cookies()).get(ONBOARDING_PATH_COOKIE)?.value;
  return (ONBOARDING_PATHS as readonly string[]).includes(value ?? "")
    ? (value as OnboardingPath)
    : null;
}

export type Progress = {
  /** How many steps of this path are done. */
  done: number;
  /** How many there are. */
  total: number;
  /** 0–100, for the bar. */
  percent: number;
  /** `4 of 6 done` — the shape 12 §5 and H3 ask for. */
  label: string;
  /**
   * What this bar counts. Stated in the module rather than at the call site,
   * because H4 is a rule about the subject and a subject supplied by the page
   * is a subject the page can change.
   */
  subject: string;
};

/**
 * The progress bar. H3 — one on every gated thing.
 *
 * H4 is the rule that matters more: **never a progress bar on raw member
 * count.** That advertises the wrong number to optimise, and it is why this
 * function takes an `UnlockState` — a list of steps somebody controls — rather
 * than any count of other people.
 */
export function progressOf(unlock: UnlockState): Progress {
  const total = stepsFor(unlock.path).length;
  const done = total - unlock.missing.length;
  return {
    done,
    total,
    percent: total === 0 ? 100 : Math.round((done / total) * 100),
    label: `${done} of ${total} done`,
    subject: "onboarding steps",
  };
}
