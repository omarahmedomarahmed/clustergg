// One vocabulary for where a challenge is. B90.3.
//
// ===== WHY THIS IS DERIVED AND NOT A COLUMN =====
//
// `challenges.status` already holds draft | active | completed | cancelled, and
// three different screens were each turning that into their own words: the
// admin list said "active", the brand portal said "running", the server portal
// said "live". Three vocabularies for one fact is how a brand and an operator
// end up describing the same challenge differently on the same call.
//
// The ladder the product actually has five rungs, and two of them are not in
// `status` at all:
//
//   draft      Built. Not paid, or not scheduled. Nothing has left the building
//   queued     Paid and dated. Starts on its Monday and nobody has been told
//   announced  The bot has told the servers it is coming. TRACKING STARTS HERE
//   live       Running
//   ended      Scored, or cancelled
//
// Rather than migrate a column that four cron paths and a dozen queries already
// depend on, the stage is DERIVED from what is already true: the status, the
// dates, and `announcedAt`. That makes it impossible for the stage to disagree
// with the row — there is no second source to drift.
//
// The one genuinely new fact is `announcedAt`, and it is new because the
// behaviour is new: a challenge used to be announced at the instant it started,
// which is a surprise competition. Announcing on Thursday for Monday gives
// every server four days to talk about it.

export type Stage = "draft" | "queued" | "announced" | "live" | "ended";

export type StageView = {
  key: Stage;
  /** What everybody calls it. The SAME word on every screen. */
  label: string;
  /** What it means, in one line, for whoever is reading. */
  blurb: string;
  /** good | warn | bad | mute — matches the admin kit's Pill tones. */
  tone: "good" | "warn" | "bad" | "mute";
};

export const STAGES: Record<Stage, StageView> = {
  draft: {
    key: "draft", label: "Draft", tone: "mute",
    blurb: "Built and not paid for. Nobody outside this screen can see it.",
  },
  queued: {
    key: "queued", label: "Queued", tone: "warn",
    blurb: "Paid and dated. It opens on its start date and no server has been told yet.",
  },
  announced: {
    key: "announced", label: "Announced", tone: "warn",
    blurb: "Every server it runs in has been told it is coming. Reach is being counted from here.",
  },
  live: {
    key: "live", label: "Live", tone: "good",
    blurb: "Running. Entrants can join and the standings are moving.",
  },
  ended: {
    key: "ended", label: "Ended", tone: "bad",
    blurb: "Closed. Winners are scored and prizes are awarded.",
  },
};

export const STAGE_ORDER: Stage[] = ["draft", "queued", "announced", "live", "ended"];

export type StageInput = {
  status: string;
  startAt: Date | string | null;
  endAt: Date | string | null;
  announcedAt?: Date | string | null;
  /**
   * Has the thing that pays for this challenge been paid?
   *
   * Optional, and the default is the safe one. A caller that knows — the admin
   * console reading an invoice, the brand portal reading a campaign — passes it
   * and gets `draft` for an unpaid challenge whatever its dates say. A caller
   * that does not know passes nothing and the dates decide, which is exactly
   * how every screen behaved before this existed.
   */
  paid?: boolean;
};

const at = (v: Date | string | null | undefined): number | null => {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/**
 * Which rung.
 *
 * Read top-down, and the order is the whole logic: an ENDED challenge is ended
 * whatever else is true of it, and an unpaid one is a draft whatever its dates
 * say. Getting those two the wrong way round would either resurrect a finished
 * challenge or show a brand that something they have not paid for is live.
 */
export function stageOf(c: StageInput, now: Date = new Date()): Stage {
  const t = now.getTime();
  const start = at(c.startAt);
  const end = at(c.endAt);

  if (c.status === "completed" || c.status === "cancelled") return "ended";
  if (end !== null && end <= t && c.status !== "draft") return "ended";

  // Unpaid beats every date. A challenge whose start date has arrived and whose
  // bill has not is not live — it is a draft somebody needs to chase.
  if (c.paid === false) return "draft";

  // A PAID DRAFT IS QUEUED, and this is the rung the ladder was missing.
  //
  // Later runs of a series are written as drafts on purpose: a dozen queries
  // across the gamer-facing product mean "status = active" when they say
  // "live", and materialising week 4 as active would put it on the homepage
  // three weeks early. So the row stays a draft, and what moves it is the
  // ANNOUNCEMENT — which is also what makes it joinable.
  //
  // Which means a draft is not one thing. A draft nobody has paid for is a
  // lead; a draft somebody HAS paid for is a challenge waiting to be announced,
  // and calling that one "draft" hides the only work left on it.
  if (c.status === "draft") return c.paid === true ? "queued" : "draft";

  if (start !== null && start > t) {
    return at(c.announcedAt) !== null ? "announced" : "queued";
  }
  return "live";
}

export const stageView = (s: Stage): StageView => STAGES[s];

/**
 * Is it too late to announce this?
 *
 * Announcing something that has already started is not an announcement, it is
 * a notification that you missed it — and it would stamp `announcedAt` after
 * the fact, which quietly corrupts the reach window the stamp exists to define.
 */
export function canAnnounce(c: StageInput, now: Date = new Date()): boolean {
  const s = stageOf(c, now);
  return s === "queued";
}
