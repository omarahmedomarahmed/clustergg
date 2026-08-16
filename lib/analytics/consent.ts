// Opt-in server analytics — granted once, refreshed on demand.
//
// ===== WHAT THIS IS, AND WHAT IT IS EMPHATICALLY NOT =====
//
// A server owner hands us read access to their member list **in exchange for
// their own analytics** (12 §7a). They choose. If they never do, nothing about
// their earning, their pool position or their portal changes — they simply do
// not get the tab.
//
// N9 / S2 — **nothing in the weekly cycle may ever read what this produces.**
// Not eligibility, not a KPI, not the pool, not a payout. *Drop the table and
// every dollar is identical.* Otherwise a server changes its own earnings by
// pressing a button, and the number it competes on depends on how often it
// refreshed. That guard lives in `tests/band1/70-pool.test.ts` and again
// inside the four-week simulation, on the division a real week is drafted
// from.
//
// ===== THE PERMISSION IS APP-WIDE, SO THE GATE IS OURS =====
//
// The GUILD_MEMBERS intent is one switch across every guild — Discord offers
// no per-guild control. So per-server consent is **our rule, kept in code**,
// and the page says *"we do not read this unless you ask us to"* and never
// *"we cannot"*, which would be a promise the architecture cannot keep.

import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";

export class AnalyticsRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsRefused";
  }
}

// ── The two knobs, and why one of them is a setting ─────────────────────────

/**
 * How long a guild waits between member-list pulls, at rest.
 *
 * N7 — **on the guild, never on the session.** Signing out and back in is not
 * a way around it, which is why it is stored on `guild_analytics_consent` and
 * not anywhere a login could clear.
 */
export const BASE_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * The platform-wide ceiling on member-list pulls per day.
 *
 * ===== THE ONE NUMBER THE DOCUMENTS LEAVE TO US =====
 *
 * 12 §7a N8 requires a ceiling and gives no figure, and Discord publishes a
 * global per-bot rate limit rather than a member-list quota — so the number is
 * ours. It is a **row in `settings`**, never a constant: admin must be able to
 * lower it the day Discord tightens something, without a deploy. This is the
 * named default the setting falls back to, and nothing else hard-codes one.
 */
export const DEFAULT_DAILY_PULL_CEILING = 500;
export const PULL_CEILING_SETTING_KEY = "analytics.dailyPullCeiling";
export const CEILING_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function pullCeiling(db: DB): Promise<number> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, PULL_CEILING_SETTING_KEY));
  const value = row?.value as unknown;
  return typeof value === "number" && value > 0 ? value : DEFAULT_DAILY_PULL_CEILING;
}

export async function setPullCeiling(
  db: DB,
  ceiling: number,
  actorId: string,
  now = new Date(),
): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key: PULL_CEILING_SETTING_KEY, value: ceiling, updatedAt: now, updatedBy: actorId })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: ceiling, updatedAt: now, updatedBy: actorId },
    });
}

// ── The grant ───────────────────────────────────────────────────────────────

/**
 * Allow analytics. **Once, per server, and it does not expire** (N1).
 *
 * Idempotent: pressing it twice does not re-date the consent or clear a
 * cooldown. A grant that moved when re-pressed would make the button a way
 * around N7.
 */
export async function grantAnalytics(
  db: DB,
  input: { guildId: string; grantedBy: string | null },
  now = new Date(),
): Promise<void> {
  await db
    .insert(schema.guildAnalyticsConsent)
    .values({ guildId: input.guildId, grantedBy: input.grantedBy, grantedAt: now })
    .onConflictDoNothing();
}

export async function consentFor(db: DB, guildId: string) {
  const [row] = await db
    .select()
    .from(schema.guildAnalyticsConsent)
    .where(eq(schema.guildAnalyticsConsent.guildId, guildId));
  return row ?? null;
}

// ── The refresh, and the two things that can hold it ────────────────────────

export type RefreshState =
  | { allowed: true }
  | {
      allowed: false;
      /** `not_granted` · `cooldown` · `ceiling` — so the page can say which. */
      code: "not_granted" | "cooldown" | "ceiling";
      reason: string;
      /** When they can try again. Null only when there is nothing to wait for. */
      until: Date | null;
    };

/**
 * How many member-list pulls the whole platform has made in the last day.
 *
 * Counted from the snapshots themselves rather than a counter, for the same
 * reason balances are `sum(ledger)`: a counter that drifts is a ceiling that
 * silently stops being one.
 */
export async function pullsInWindow(db: DB, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - CEILING_WINDOW_MS);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.guildSnapshots)
    .where(gt(schema.guildSnapshots.takenAt, since));
  return row?.n ?? 0;
}

/**
 * N8 — **the ceiling lengthens every server's cooldown at once.**
 *
 * Not a hard stop at the limit and free below it. As the platform approaches
 * Discord's limit the wait grows *everywhere*, so the platform degrades evenly
 * instead of the first servers to press Update spending the whole budget and
 * the rest hitting a wall. A server that cannot refresh right now is told
 * plainly why and when — and reads its last snapshot, dated, meanwhile (N6).
 */
export function cooldownForLoad(used: number, ceiling: number): number {
  const load = ceiling > 0 ? used / ceiling : 1;
  if (load < 0.5) return BASE_COOLDOWN_MS;
  if (load < 0.8) return BASE_COOLDOWN_MS * 2;
  if (load < 1) return BASE_COOLDOWN_MS * 6;
  return BASE_COOLDOWN_MS * 24;
}

export async function refreshState(
  db: DB,
  guildId: string,
  now = new Date(),
): Promise<RefreshState> {
  const consent = await consentFor(db, guildId);
  if (!consent) {
    return {
      allowed: false,
      code: "not_granted",
      reason:
        "Analytics is off for this server. Press Allow analytics and we will " +
        "read your member list — only for this page, and only when you ask us to.",
      until: null,
    };
  }

  // N7 — the guild's own cooldown. Checked first, because it is the one the
  // owner can predict and the one they caused.
  if (consent.cooldownUntil && now.getTime() < consent.cooldownUntil.getTime()) {
    return {
      allowed: false,
      code: "cooldown",
      reason:
        `This server's snapshot was refreshed recently. You can update it ` +
        `again at ${consent.cooldownUntil.toISOString().slice(0, 16).replace("T", " ")} UTC. ` +
        `Your last snapshot is below and it is dated — signing out and back in ` +
        `does not change this, because the wait is on the server, not on you.`,
      until: consent.cooldownUntil,
    };
  }

  const ceiling = await pullCeiling(db);
  const used = await pullsInWindow(db, now);
  if (used >= ceiling) {
    const until = new Date(now.getTime() + cooldownForLoad(used, ceiling));
    return {
      allowed: false,
      code: "ceiling",
      reason:
        `Cluster is at its daily limit for reading member lists across every ` +
        `server, so refreshes are paused for everyone until ` +
        `${until.toISOString().slice(0, 16).replace("T", " ")} UTC. This is not ` +
        `about your server. Your last snapshot is below, dated.`,
      until,
    };
  }

  return { allowed: true };
}

/**
 * Take a snapshot. **The only thing that costs a call** (N6).
 *
 * The reader is injected rather than imported so this module has no dependency
 * on Discord at all — which is what lets the band exercise the cooldown, the
 * ceiling and the dating without a network, and lets the guard that says *no
 * dollar depends on this* be about data rather than about mocking.
 */
export type MemberListReading = {
  memberCount: number;
  linkedCount: number;
  roles?: { id: string; name: string; members: number }[];
  roleHolders?: Record<string, string[]>;
};

export async function refreshSnapshot(
  db: DB,
  input: {
    guildId: string;
    takenBy: string | null;
    read: () => Promise<MemberListReading>;
  },
  now = new Date(),
): Promise<{ id: string; takenAt: Date }> {
  const state = await refreshState(db, input.guildId, now);
  if (!state.allowed) throw new AnalyticsRefused(state.reason);

  const reading = await input.read();
  const id = uid();
  await db.insert(schema.guildSnapshots).values({
    id,
    guildId: input.guildId,
    takenAt: now,
    takenBy: input.takenBy,
    memberCount: reading.memberCount,
    linkedCount: reading.linkedCount,
    rolesJson: reading.roles ?? null,
    roleHoldersJson: reading.roleHolders ?? null,
  });

  // The next wait is computed from the load **after** this pull, so a platform
  // filling up slows down as it fills rather than at a threshold.
  const ceiling = await pullCeiling(db);
  const used = await pullsInWindow(db, now);
  await db
    .update(schema.guildAnalyticsConsent)
    .set({
      lastPullAt: now,
      cooldownUntil: new Date(now.getTime() + cooldownForLoad(used, ceiling)),
    })
    .where(eq(schema.guildAnalyticsConsent.guildId, input.guildId));

  return { id, takenAt: now };
}

/**
 * The last snapshot. **Always readable** (N6).
 *
 * It is data we already hold; only **Update** costs a call. A page that hid
 * the snapshot while the cooldown ran would make the cooldown feel like a
 * punishment and push owners to refresh the moment it lifts, which is the
 * opposite of what the ceiling is for.
 */
export async function lastSnapshot(db: DB, guildId: string) {
  const [row] = await db
    .select()
    .from(schema.guildSnapshots)
    .where(eq(schema.guildSnapshots.guildId, guildId))
    .orderBy(desc(schema.guildSnapshots.takenAt))
    .limit(1);
  return row ?? null;
}

/** Everything the analytics tab and the registry's analytics section render. */
export type AnalyticsView = {
  granted: boolean;
  grantedAt: Date | null;
  snapshot: Awaited<ReturnType<typeof lastSnapshot>>;
  /** S1 — never displayed without its date. Null when there is no snapshot. */
  takenAt: Date | null;
  refresh: RefreshState;
};

export async function analyticsView(
  db: DB,
  guildId: string,
  now = new Date(),
): Promise<AnalyticsView> {
  const consent = await consentFor(db, guildId);
  const snapshot = await lastSnapshot(db, guildId);
  return {
    granted: consent !== null,
    grantedAt: consent?.grantedAt ?? null,
    snapshot,
    takenAt: snapshot?.takenAt ?? null,
    refresh: await refreshState(db, guildId, now),
  };
}

/**
 * The three sentences the page must carry, held here so the page cannot
 * paraphrase one away.
 *
 * N3, N4, and 12 §7a's read-only notice. The third is the one with a trap in
 * it: it says *we do not read this unless you ask us to*, and never *we
 * cannot*, because the GUILD_MEMBERS intent is app-wide and "cannot" would be
 * a promise the architecture cannot keep.
 */
export const ANALYTICS_NOTICES = {
  sensitive:
    "This page contains detailed information about your members. Do not open " +
    "it with somebody looking over your shoulder.",
  scope:
    "We do not read your member list for anything else — not for scoring, not " +
    "for the pool, not for eligibility. Only here.",
  readOnly:
    "This is read only. You cannot manage your server, your members or your " +
    "roles from Cluster, and nothing here changes anything on Discord.",
} as const;
