import { ACTION_CATALOG, DEFAULT_DAILY_CP_CEILING, type QuestActionKey } from "@/lib/quests";

// The Daily Mission (B61) — the model, and nothing else.
//
// The 500 cap, given a shape. **Framing, not economics: a mission awards no CP
// of its own.** Every point comes from actions the gamer already does, at the
// prices `ACTION_CATALOG` sets, under the caps B17 enforces. The moment a
// mission pays, the cap stops being the ceiling and the exposure doubles
// through a feature that reads as copywriting.
//
// Four templates, and a week picks one. Not a per-gamer random draw: a gamer and
// their friend see the same mission, support can reproduce what somebody saw,
// and "why is mine different" has an answer. The SHAPE is fixed; the WORDS are
// personal — their in-game name, the server they joined from, a challenge they
// can actually enter.
//
// Admin owns all of it: the four templates are saved and editable, and any
// day's mission can be replaced — but only from TOMORROW onward, which is the
// one rule this file enforces rather than trusts. Editing today's mission after
// gamers have started it moves the goalposts under people who are already
// running at them.
//
// No server imports: the admin editor is a client component and needs the same
// types and the same validator the renderer uses.

/** One task: an action, and how many times. */
export type MissionTask = { action: QuestActionKey; count: number };

/** One mission: eight tasks, two per quest, totalling the ceiling exactly. */
export type MissionTemplate = {
  id: string;
  name: string;
  /** One line, shown on the card and the band. */
  blurb: string;
  tasks: MissionTask[];
};

export const QUEST_GROUPS = ["conquest", "orbit", "ascension", "signal"] as const;
export type QuestGroup = (typeof QUEST_GROUPS)[number];

/**
 * The four, as shipped.
 *
 * Every quest block is 125 and every mission is 500 — asserted in
 * `tests/db/missions.mts` against the LIVE prices, not against these numbers,
 * so the table and the missions can never drift apart again. That assertion is
 * the whole reason the arithmetic is safe to state here.
 */
export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    id: "show-up",
    name: "Show up",
    blurb: "A day of turning up: enter something, move your score, be seen.",
    tasks: [
      { action: "join_challenge", count: 1 },        // 25
      { action: "challenge_progress", count: 4 },    // 100
      { action: "share_card", count: 3 },            // 75
      { action: "follower_gained", count: 2 },       // 50
      { action: "stat_levelup", count: 4 },          // 100
      { action: "redeem_trophy", count: 1 },         // 25
      { action: "ad_click", count: 3 },              // 75
      { action: "botlist_vote", count: 2 },          // 50
    ],
  },
  {
    id: "get-seen",
    name: "Get seen",
    blurb: "Put yourself in front of people — and put Cluster in front of them.",
    tasks: [
      { action: "join_challenge", count: 2 },        // 50
      { action: "challenge_progress", count: 3 },    // 75
      { action: "profile_views_25", count: 3 },      // 75
      { action: "profile_vote_received", count: 2 }, // 50
      { action: "play_session", count: 3 },          // 75
      { action: "stat_levelup", count: 2 },          // 50
      { action: "ad_click", count: 3 },              // 75
      { action: "bot_added", count: 2 },             // 50
    ],
  },
  {
    id: "give-back",
    name: "Give back",
    blurb: "Finish what you started, and hand something to somebody else.",
    tasks: [
      { action: "finish_challenge", count: 1 },      // 25
      { action: "challenge_progress", count: 4 },    // 100
      { action: "share_card", count: 3 },            // 75
      { action: "gift_sent", count: 2 },             // 50
      { action: "stat_levelup", count: 3 },          // 75
      { action: "redeem_trophy", count: 2 },         // 50
      { action: "ad_click", count: 3 },              // 75
      { action: "bot_added", count: 2 },             // 50
    ],
  },
  {
    id: "bring-people",
    name: "Bring people",
    blurb: "Close out your competitions and bring the rest of your server in.",
    tasks: [
      { action: "finish_challenge", count: 2 },      // 50
      { action: "challenge_progress", count: 3 },    // 75
      { action: "profile_views_25", count: 3 },      // 75
      { action: "gift_received", count: 2 },         // 50
      { action: "play_session", count: 3 },          // 75
      { action: "stat_levelup", count: 2 },          // 50
      { action: "ad_click", count: 3 },              // 75
      { action: "botlist_vote", count: 2 },          // 50
    ],
  },
];

const WEIGHT = new Map(ACTION_CATALOG.map((a) => [a.key, a.defaultWeight]));
const CAP = new Map(ACTION_CATALOG.map((a) => [a.key, a.defaultCap]));
const GROUP = new Map(ACTION_CATALOG.map((a) => [a.key, a.group]));

/** What a mission pays if every task is done — at the prices passed in. */
export function missionTotal(
  m: { tasks: MissionTask[] },
  weights: Map<string, number> = WEIGHT,
): number {
  return m.tasks.reduce((sum, t) => sum + (weights.get(t.action) ?? 0) * t.count, 0);
}

/** Per quest, so a block that does not come to 125 is visible in the editor. */
export function missionByGroup(
  m: { tasks: MissionTask[] },
  weights: Map<string, number> = WEIGHT,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of m.tasks) {
    const g = GROUP.get(t.action) ?? "other";
    out[g] = (out[g] ?? 0) + (weights.get(t.action) ?? 0) * t.count;
  }
  return out;
}

export type MissionProblem = { task?: MissionTask; message: string };

/**
 * What is wrong with a mission, in the admin's terms.
 *
 * Returned as a list rather than thrown, because the editor shows them while
 * somebody is still typing. `launchable()` is the gate; this is the explanation.
 *
 * The count-over-cap check is the one that matters: "join a challenge x3" with a
 * cap of 2 is a mission whose last task cannot be completed by anybody, and
 * nothing about it looks wrong until a gamer is stuck on it at midnight.
 */
export function missionProblems(
  m: { tasks: MissionTask[] },
  ceiling = DEFAULT_DAILY_CP_CEILING,
  weights: Map<string, number> = WEIGHT,
  caps: Map<string, number> = CAP,
): MissionProblem[] {
  const out: MissionProblem[] = [];
  if (!m.tasks.length) return [{ message: "A mission with no tasks is not a mission." }];

  for (const t of m.tasks) {
    if (!WEIGHT.has(t.action)) { out.push({ task: t, message: `${t.action} is not an action.` }); continue; }
    if ((weights.get(t.action) ?? 0) <= 0) out.push({ task: t, message: `${t.action} pays nothing, so this task can never be completed.` });
    if (!Number.isInteger(t.count) || t.count < 1) out.push({ task: t, message: `A count has to be a whole number of times, at least once.` });
    const cap = caps.get(t.action) ?? 0;
    if (cap > 0 && t.count > cap) {
      out.push({ task: t, message: `${t.action} is capped at ${cap} a day — asking for ${t.count} is a task nobody can finish.` });
    }
  }

  const seen = new Set<string>();
  for (const t of m.tasks) {
    if (seen.has(t.action)) out.push({ task: t, message: `${t.action} appears twice — combine them into one count.` });
    seen.add(t.action);
  }

  const total = missionTotal(m, weights);
  if (total !== ceiling) {
    out.push({
      message: total > ceiling
        // Over the ceiling is not "generous": the cap clamps it, so the last
        // tasks pay nothing and the mission lies about what it is worth.
        ? `This adds up to ${total}, and the day's ceiling is ${ceiling} — the last tasks would pay nothing.`
        : `This adds up to ${total}, and a mission has to be the whole ${ceiling}.`,
    });
  }
  return out;
}

export const launchable = (m: { tasks: MissionTask[] }, ceiling = DEFAULT_DAILY_CP_CEILING): boolean =>
  missionProblems(m, ceiling).length === 0;

// ===== Which mission runs on which day =====

/** UTC day key — the SAME boundary the CP ceiling resets on. */
export function dayKey(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/** Days since the epoch, for a rotation that does not care about timezones. */
const dayNumber = (at: Date) => Math.floor(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) / 86400000);

/** The ISO week this day falls in — the rotation's unit. */
export function weekNumber(at: Date = new Date()): number {
  // Thursday-anchored, so a week is a week wherever the year boundary lands.
  return Math.floor((dayNumber(at) + 3) / 7);
}

/**
 * The template a day gets when nobody has said otherwise.
 *
 * By WEEK, not by day: everyone is on the same mission all week, and the four
 * rotate week to week. A per-day rotation would mean a gamer's streak crossed
 * four different missions in four days, which is variety nobody asked for and
 * a support answer nobody can give.
 */
export function templateForWeek(at: Date = new Date(), templates = MISSION_TEMPLATES): MissionTemplate {
  return templates[((weekNumber(at) % templates.length) + templates.length) % templates.length];
}

/**
 * Can this day still be edited?
 *
 * **Tomorrow onward, never today.** A mission edited after gamers have started
 * it moves the goalposts under people already running at them — someone three
 * tasks in finds a different three tasks. The gate is a pure function of two
 * dates so the answer is the same in the editor, in the action that saves, and
 * in the test.
 */
export function editable(day: string, now: Date = new Date()): boolean {
  return day > dayKey(now);
}

/** The first day an admin may edit — what the editor opens on. */
export function nextEditableDay(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + 1);
  return dayKey(d);
}

/** A scheduled day: a template, or an admin's own edit of one. */
export type ScheduledMission = {
  day: string;
  /** Which template it started from — kept even after edits, so "edited from Show up" is sayable. */
  templateId: string;
  name: string;
  blurb: string;
  tasks: MissionTask[];
  /** True when an admin has changed it from the template. */
  edited: boolean;
};

const cleanTasks = (v: unknown): MissionTask[] => {
  if (!Array.isArray(v)) return [];
  const out: MissionTask[] = [];
  for (const raw of v) {
    const o = (raw ?? {}) as Partial<MissionTask>;
    if (typeof o.action !== "string" || !WEIGHT.has(o.action as QuestActionKey)) continue;
    const count = Math.max(1, Math.min(50, Math.floor(Number(o.count) || 0)));
    if (!count) continue;
    out.push({ action: o.action as QuestActionKey, count });
  }
  return out.slice(0, 12);
};

const str = (v: unknown, fallback: string, max: number) =>
  (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback);

/**
 * Parse a stored schedule entry, with the week's template behind it.
 *
 * An entry that is missing, malformed, or edited into something invalid falls
 * back to the template rather than leaving a day with no mission. A day with no
 * mission is a gamer opening the band to nothing, and it would be caused by our
 * own bad row.
 */
export function parseScheduled(raw: unknown, day: string, templates = MISSION_TEMPLATES): ScheduledMission {
  const fallback = templateForWeek(new Date(`${day}T12:00:00Z`), templates);
  const base: ScheduledMission = {
    day, templateId: fallback.id, name: fallback.name, blurb: fallback.blurb,
    tasks: fallback.tasks, edited: false,
  };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const from = templates.find((t) => t.id === o.templateId) ?? fallback;
  const tasks = cleanTasks(o.tasks);
  if (!tasks.length) return { ...base, templateId: from.id, name: from.name, blurb: from.blurb, tasks: from.tasks };
  return {
    day,
    templateId: from.id,
    name: str(o.name, from.name, 40),
    blurb: str(o.blurb, from.blurb, 140),
    tasks,
    edited: JSON.stringify(tasks) !== JSON.stringify(from.tasks),
  };
}

// ===== Progress, read rather than counted =====

/**
 * How today is going, from counts the ledger already has.
 *
 * `quest_events` is the source of truth for CP (B34.2), so both readouts here
 * are two views of ONE ledger rather than a second tally that can drift from
 * it — drift that would, inevitably, look like us withholding money.
 *
 * Which is what makes the case that matters correct for free: **the total can
 * be complete while no task is ticked.** A gamer who earned 500 another way has
 * completed the day, and their mission simply shows that they did it their way.
 */
export type MissionProgress = {
  mission: ScheduledMission;
  tasks: { action: QuestActionKey; label: string; count: number; done: number; complete: boolean; cp: number }[];
  /** CP earned today, from any source. */
  earned: number;
  ceiling: number;
  /** True when the day's full ceiling has been earned — however it was earned. */
  complete: boolean;
};

export function progressOf(
  mission: ScheduledMission,
  countsToday: Record<string, number>,
  earned: number,
  ceiling = DEFAULT_DAILY_CP_CEILING,
  weights: Map<string, number> = WEIGHT,
): MissionProgress {
  const label = new Map(ACTION_CATALOG.map((a) => [a.key, a.label]));
  return {
    mission,
    tasks: mission.tasks.map((t) => {
      const done = Math.max(0, Math.floor(countsToday[t.action] ?? 0));
      return {
        action: t.action,
        label: label.get(t.action) ?? t.action,
        count: t.count,
        done: Math.min(done, t.count),
        complete: done >= t.count,
        cp: (weights.get(t.action) ?? 0) * t.count,
      };
    }),
    earned,
    ceiling,
    complete: ceiling > 0 && earned >= ceiling,
  };
}

// ===== The streak =====

/**
 * A day counts when the FULL ceiling was earned, however it was earned.
 *
 * The streak is a LOOP, not a ladder you finish: day 7 awards its trophy, day 14
 * the next, and a missed day returns the count to zero — after which the climb
 * back to 7 awards the 7-day trophy again.
 */
export type Milestone = { days: number; trophyId: string | null };

export function parseMilestones(raw: unknown): Milestone[] {
  if (!Array.isArray(raw)) return [];
  const out: Milestone[] = [];
  for (const v of raw) {
    const o = (v ?? {}) as Partial<Milestone>;
    const days = Math.floor(Number(o.days) || 0);
    if (days < 1 || days > 365) continue;
    const trophyId = typeof o.trophyId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(o.trophyId) ? o.trophyId : null;
    if (out.some((m) => m.days === days)) continue;
    out.push({ days, trophyId });
  }
  return out.sort((a, b) => a.days - b.days);
}

/**
 * The streak, from the days that hit the ceiling.
 *
 * Counts back from today (or yesterday, if today is not done yet — a day still
 * in progress must not break a streak at 00:01).
 */
export function streakFrom(fullDays: Set<string>, now: Date = new Date()): number {
  const today = dayKey(now);
  const cursor = new Date(`${today}T12:00:00Z`);
  if (!fullDays.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let n = 0;
  for (;;) {
    if (!fullDays.has(dayKey(cursor))) return n;
    n += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (n > 3650) return n;
  }
}

/**
 * Which milestones a streak of this length has just passed.
 *
 * Fires ONCE PER STREAK — reaching day 7 does not re-award at day 8 — and a
 * longer streak passes through every milestone below it in turn, so a gamer who
 * reaches 14 has earned both the 7 and the 14.
 */
export function milestonesHit(streak: number, milestones: Milestone[], alreadyThisStreak: number[] = []): Milestone[] {
  const done = new Set(alreadyThisStreak);
  return milestones.filter((m) => m.days <= streak && !done.has(m.days));
}

/** The next one to aim at, and how far off it is. */
export function nextMilestone(streak: number, milestones: Milestone[]): { milestone: Milestone; away: number } | null {
  const next = milestones.find((m) => m.days > streak);
  return next ? { milestone: next, away: next.days - streak } : null;
}
