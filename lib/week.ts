// The competition week.
//
// Voting runs Monday to Saturday. Sunday is announcement day: the board is
// frozen, the winners are called on stream, and the next week opens on Monday.
//
// Two things make this harder than it looks, and both are handled here so
// nothing else has to think about them:
//
//  - A week needs ONE clock. If the boundary moved with each viewer's timezone,
//    two people would see different leaderboards at the same moment and the
//    winner would depend on where you were standing. So every boundary is
//    computed in a single configured zone (UTC by default, admin-settable).
//  - A week needs a stable NAME. Ranking by "votes in the last seven days"
//    silently rewrites history every time you load the page; a stored week key
//    means last week's result is still last week's result a year later.
//
// The key is the ISO date of the week's Monday in the competition zone —
// "2026-07-27" — which sorts, reads and diffs correctly with no extra rules.

export const WEEK_TZ_KEY = "vote.week.timezone";
export const DEFAULT_WEEK_TZ = "UTC";

export type WeekPhase = "voting" | "announcement";

export type Week = {
  /** ISO date of this week's Monday, in the competition zone. */
  key: string;
  /** Monday 00:00 in the competition zone, as an instant. */
  startsAt: Date;
  /** Sunday 00:00 — the moment voting closes and announcement day begins. */
  votingEndsAt: Date;
  /** Next Monday 00:00 — when this week is over entirely. */
  endsAt: Date;
  /** Where we are inside it right now. */
  phase: WeekPhase;
  timezone: string;
};

// What a zone's clock reads at a given instant. `Intl` is the only thing in the
// platform that knows about daylight saving, so the offset is derived from it
// rather than assumed — a competition that shifts by an hour twice a year
// because someone hard-coded +02:00 is a support ticket nobody can diagnose.
function partsIn(at: Date, timezone: string): { y: number; m: number; d: number; h: number; mi: number; s: number; dow: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23", weekday: "short",
  });
  const got: Record<string, string> = {};
  for (const p of fmt.formatToParts(at)) got[p.type] = p.value;
  const DOW: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    y: Number(got.year), m: Number(got.month), d: Number(got.day),
    h: Number(got.hour), mi: Number(got.minute), s: Number(got.second),
    dow: DOW[got.weekday] ?? 1,
  };
}

/** The zone's offset from UTC, in minutes, at a given instant. */
function offsetMinutes(at: Date, timezone: string): number {
  const p = partsIn(at, timezone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** The instant at which the zone's wall clock reads this local date, midnight. */
function midnightAt(y: number, m: number, d: number, timezone: string): Date {
  // Guess using the offset at the naive instant, then correct once. One pass is
  // enough for every real zone: the guess is at most an hour out, and an hour's
  // error can only change the offset across a DST boundary, which the second
  // reading resolves.
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0);
  const guess = new Date(naive - offsetMinutes(new Date(naive), timezone) * 60000);
  const corrected = new Date(naive - offsetMinutes(guess, timezone) * 60000);
  return corrected;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Add days to a local calendar date, without touching clocks. */
function addDays(y: number, m: number, d: number, n: number): { y: number; m: number; d: number } {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** The competition week containing an instant. */
export function weekAt(at: Date = new Date(), timezone: string = DEFAULT_WEEK_TZ): Week {
  let tz = timezone;
  // An unknown zone would throw on every request. Falling back is the only
  // acceptable failure here — the site does not go down because a settings
  // field has a typo in it.
  try { partsIn(at, tz); } catch { tz = DEFAULT_WEEK_TZ; }

  const p = partsIn(at, tz);
  const mon = addDays(p.y, p.m, p.d, -(p.dow - 1)); // Monday of this week
  const sun = addDays(mon.y, mon.m, mon.d, 6);      // Sunday — announcement day
  const next = addDays(mon.y, mon.m, mon.d, 7);     // next Monday

  return {
    key: iso(mon.y, mon.m, mon.d),
    startsAt: midnightAt(mon.y, mon.m, mon.d, tz),
    votingEndsAt: midnightAt(sun.y, sun.m, sun.d, tz),
    endsAt: midnightAt(next.y, next.m, next.d, tz),
    phase: p.dow === 7 ? "announcement" : "voting",
    timezone: tz,
  };
}

/** The week a stored key names, so a past result can be re-rendered exactly. */
export function weekFromKey(key: string, timezone: string = DEFAULT_WEEK_TZ): Week | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const at = midnightAt(Number(m[1]), Number(m[2]), Number(m[3]), timezone);
  return Number.isFinite(at.getTime()) ? weekAt(new Date(at.getTime() + 36e5), timezone) : null;
}

/** The week before a given one. */
export function previousWeek(w: Week): Week {
  return weekAt(new Date(w.startsAt.getTime() - 36e5), w.timezone);
}

/**
 * The week a vote cast at this instant belongs to — or null on announcement
 * day, when a vote still counts toward a lifetime total but toward no week.
 */
export function weekKeyForVote(at: Date, timezone: string): string | null {
  const w = weekAt(at, timezone);
  return w.phase === "voting" ? w.key : null;
}

/** "3d 04h 12m" — what the band counts down to. */
export function untilLabel(target: Date, from: Date = new Date()): string {
  const ms = Math.max(0, target.getTime() - from.getTime());
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const mi = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${String(h).padStart(2, "0")}h ${String(mi).padStart(2, "0")}m`;
  if (h > 0) return `${h}h ${String(mi).padStart(2, "0")}m`;
  return `${mi}m`;
}
