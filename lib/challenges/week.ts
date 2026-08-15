// The week, and why there is no date picker.
//
// Mon 00:00 UTC → Fri 00:00 UTC is the competition. Sat and Sun are the grace
// period. docs/00-TRUTH.md §2, and the whole of docs/01-CYCLE.md.
//
// L6/C2: **start is always the start of a week.** There is no date picker
// anywhere, for anyone — not for a brand, not for an owner, not for admin. A
// rule enforced only by the absence of a control is a rule until somebody
// writes a script, so the model refuses a non-boundary start and the UI simply
// never offers one.
//
// Everything here is UTC. Not "usually UTC" — the gun is an instant, and a
// platform whose competition window drifts with a server's timezone has a
// different competition in March and October.

/** Milliseconds, named, because `86400000` in an expression is a typo waiting. */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Mon 00:00 UTC → Fri 00:00 UTC. Five days of competition. */
export const COMPETITION_DAYS = 4;
/** Sat + Sun. Not downtime — this is when one week closes and the next loads. */
export const GRACE_DAYS = 3;

export type Week = {
  /** Monday 00:00:00.000 UTC. The gun. */
  start: Date;
  /** Friday 00:00:00.000 UTC. The close. */
  end: Date;
  /** The following Monday 00:00 UTC. */
  nextStart: Date;
};

/** The Monday 00:00 UTC at or before `at`. */
export function weekStartFor(at: Date): Date {
  const d = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 0, 0, 0, 0),
  );
  // getUTCDay: 0 = Sunday. Monday is 1, so Sunday is six days after a Monday.
  const dayFromMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayFromMonday);
  return d;
}

export function weekFor(at: Date): Week {
  const start = weekStartFor(at);
  return {
    start,
    end: new Date(start.getTime() + COMPETITION_DAYS * DAY),
    nextStart: new Date(start.getTime() + 7 * DAY),
  };
}

/** The Monday `n` weeks after the one containing `at`. n=0 is this week. */
export function weekStartPlus(at: Date, n: number): Date {
  return new Date(weekStartFor(at).getTime() + n * 7 * DAY);
}

/**
 * The earliest week a challenge bought now can start.
 *
 * L7: bought mid-week → next week, or any week after. Never this week — the
 * gun has already fired and the entrants who joined before it would be scored
 * against a baseline stamped days ago.
 */
export function earliestSellableWeek(now: Date): Date {
  return weekStartPlus(now, 1);
}

export type Phase = "run" | "grace";

/**
 * Which phase of the cycle an instant falls in.
 *
 * Every surface asks this: the homepage shows a countdown during `run` and
 * winners during `grace`, the community block moves, the bot's cards change.
 */
export function phaseAt(at: Date): Phase {
  const { start, end } = weekFor(at);
  return at.getTime() >= start.getTime() && at.getTime() < end.getTime() ? "run" : "grace";
}

/** Milliseconds until Friday 00:00 UTC. Negative once the week has closed. */
export function msUntilClose(at: Date): number {
  return weekFor(at).end.getTime() - at.getTime();
}

/**
 * How a late joiner is told what they are getting into.
 *
 * B4: "Scoring starts now. 2 days left." Not a refusal — they may join until
 * the final second (B5) — but they must not think they are getting the week.
 */
export function joiningLateNotice(at: Date): string | null {
  const remaining = msUntilClose(at);
  if (remaining <= 0) return null;
  const { start } = weekFor(at);
  // Inside the first hour nobody is late.
  if (at.getTime() - start.getTime() < HOUR) return null;
  const days = Math.floor(remaining / DAY);
  const hours = Math.floor((remaining % DAY) / HOUR);
  if (days >= 1) {
    return `Scoring starts now. ${days} day${days === 1 ? "" : "s"} left.`;
  }
  if (hours >= 1) {
    return `Scoring starts now. ${hours} hour${hours === 1 ? "" : "s"} left.`;
  }
  return "Scoring starts now. Less than an hour left.";
}

/** A day boundary, for the daily cadence admin can build. */
export function dayStartFor(at: Date): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 0, 0, 0, 0),
  );
}

export function dayEndFor(at: Date): Date {
  return new Date(dayStartFor(at).getTime() + DAY);
}

/**
 * Whether an instant is a legal start for a challenge of this cadence.
 *
 * Enforced in the model. C2 says "in the model, not the UI", and this is what
 * that sentence buys: an admin script, a seed fixture and a brand's form all
 * hit the same refusal.
 */
export function isPeriodBoundary(at: Date, cadence: "weekly" | "daily"): boolean {
  return (
    (cadence === "weekly" ? weekStartFor(at) : dayStartFor(at)).getTime() === at.getTime()
  );
}

/** The end of a challenge that starts at `start`. Friday for a week, midnight for a day. */
export function periodEnd(start: Date, cadence: "weekly" | "daily"): Date {
  return cadence === "weekly"
    ? new Date(start.getTime() + COMPETITION_DAYS * DAY)
    : dayEndFor(start);
}
