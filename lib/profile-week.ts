import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { getContent } from "@/lib/cms";
import {
  DEFAULT_WEEK_TZ, WEEK_TZ_KEY, weekAt, weekFromKey, previousWeek, type Week,
} from "@/lib/week";

// Profile of the Week — the competition itself.
//
// Voting runs Monday to Saturday; Sunday the board freezes and the winners are
// called on stream. Every gamer is in it from the moment they have an account,
// because a competition you have to enter is a competition almost nobody
// enters.
//
// Standings are computed, never stored, until a week is closed. Real votes,
// staff adjustments and disqualifications all feed the same query, so a
// correction shows up immediately rather than waiting for a recount — and the
// adjustments live in their own audit table rather than as edits to the votes,
// so "who changed this and why" always has an answer.

export const STREAM_URL_KEY = "vote.week.stream.url";
export const STREAM_LIVE_KEY = "vote.week.stream.live";
export const FREEZE_KEY = "vote.week.freeze";
export const PODIUM_TROPHY_KEY = "vote.week.trophy";

export type WeekEntry = {
  rank: number;
  userId: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  /** The gamer's own art — what their entry card is drawn on. */
  bannerUrl: string | null;
  bgImage: string | null;
  accent: string;
  accent2: string;
  title: string | null;
  country: string | null;
  /** Votes banked this week, after staff adjustments. */
  weekVotes: number;
  /** Votes ever, across every week. */
  lifetimeVotes: number;
  /** Sum of staff adjustments, so a corrected score can say so. */
  adjustment: number;
  disqualified: boolean;
  /** Has the person looking already voted for them this week? */
  votedByMe: boolean;
};

/** The prize a closed week paid out, resolved for display. */
export type WeekTrophy = { id: string; name: string; imageUrl: string; tier: string; value: number } | null;

export type WeekBoard = {
  week: Week;
  entries: WeekEntry[];
  /** Can a vote be cast right now? */
  votingOpen: boolean;
  /** Why not, when it can't. */
  closedReason: "announcement" | "frozen" | null;
  stream: { url: string | null; live: boolean };
  /** Set once a week has been closed and called. */
  result: {
    podium: { userId: string; slug: string; displayName: string; votes: number }[];
    announcedAt: Date | null;
    /** What the podium won, so the announcement can show the actual prize. */
    trophy: WeekTrophy;
  } | null;
  takenAt: string;
};

// ===== Settings =====

export async function weekTimezone(): Promise<string> {
  try {
    const c = await getContent([WEEK_TZ_KEY]);
    return c[WEEK_TZ_KEY]?.trim() || DEFAULT_WEEK_TZ;
  } catch { return DEFAULT_WEEK_TZ; }
}

/** The week we're in right now, in the competition's own clock. */
export async function currentWeek(): Promise<Week> {
  return weekAt(new Date(), await weekTimezone());
}

// ===== Voting rules =====

export type VoteWindow = {
  week: Week;
  /** The week a vote cast now banks to — null on announcement day. */
  bankTo: string | null;
  open: boolean;
  closedReason: "announcement" | "frozen" | null;
};

/**
 * Whether a vote can be cast right now, and where it would land.
 *
 * Announcement day is deliberately two settings deep. The brief said both "they
 * can still be voted for, it just goes to their lifetime" and "voting is off on
 * Sunday so we can announce" — which are different products. So Sunday votes
 * never touch a week either way, and a switch decides whether they're accepted
 * at all. Frozen is the default: a board that can still move while someone is
 * reading the winners out on stream is a board that will embarrass you.
 */
export async function voteWindow(): Promise<VoteWindow> {
  const week = await currentWeek();
  if (week.phase === "voting") return { week, bankTo: week.key, open: true, closedReason: null };
  let frozen = true;
  try {
    const c = await getContent([FREEZE_KEY]);
    frozen = c[FREEZE_KEY] !== "0";
  } catch { /* default to frozen */ }
  return {
    week,
    bankTo: null,
    open: !frozen,
    closedReason: frozen ? "frozen" : "announcement",
  };
}

// ===== The board =====

const ENTRY_COLUMNS = {
  userId: schema.users.id,
  slug: schema.users.slug,
  displayName: schema.users.displayName,
  avatarUrl: schema.users.avatarUrl,
  bannerUrl: schema.users.bannerUrl,
  theme: schema.users.theme,
  title: schema.users.title,
  country: schema.users.country,
  lifetimeVotes: schema.users.voteCount,
};

/**
 * The standings for a week.
 *
 * `viewerId` is whoever is looking, so each entry can say whether they've
 * already used their vote on that gamer — the leaderboard is where most votes
 * will be cast, and a vote button that doesn't know its own state is worse than
 * no button.
 */
export async function weekBoard(opts: {
  weekKey?: string;
  viewerId?: string | null;
  limit?: number;
} = {}): Promise<WeekBoard> {
  const tz = await weekTimezone();
  const week = opts.weekKey ? (weekFromKey(opts.weekKey, tz) ?? weekAt(new Date(), tz)) : weekAt(new Date(), tz);
  const limit = Math.max(3, Math.min(100, opts.limit ?? 25));

  const empty: WeekBoard = {
    week, entries: [], votingOpen: false, closedReason: null,
    stream: { url: null, live: false }, result: null, takenAt: new Date().toISOString(),
  };

  try {
    const db = await getDb();
    const [tally, actions, stored, settings, win] = await Promise.all([
      // Votes banked to this week, per profile.
      db.select({
        profileUserId: schema.profileVotes.profileUserId,
        n: sql<number>`count(*)`,
      })
        .from(schema.profileVotes)
        .where(eq(schema.profileVotes.weekKey, week.key))
        .groupBy(schema.profileVotes.profileUserId),
      db.select().from(schema.voteWeekActions).where(eq(schema.voteWeekActions.weekKey, week.key)),
      db.select().from(schema.voteWeeks).where(eq(schema.voteWeeks.weekKey, week.key)).limit(1),
      getContent([STREAM_URL_KEY, STREAM_LIVE_KEY]).catch(() => ({} as Record<string, string>)),
      voteWindow(),
    ]);

    // Adjustments and disqualifications, latest-wins per gamer.
    const adjust = new Map<string, number>();
    const dq = new Set<string>();
    for (const a of [...actions].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())) {
      if (a.action === "adjust") adjust.set(a.profileUserId, (adjust.get(a.profileUserId) ?? 0) + a.delta);
      else if (a.action === "disqualify") dq.add(a.profileUserId);
      else if (a.action === "reinstate") dq.delete(a.profileUserId);
    }

    const counted = new Map(tally.map((t) => [t.profileUserId, Number(t.n)]));
    // Everyone with either a vote or an adjustment this week is in the running.
    const contenders = new Set<string>([...counted.keys(), ...adjust.keys()]);

    // A board with three names on it doesn't look like a competition. When too
    // few people have votes yet, it's padded with real profiles on zero —
    // which is also the honest state of a week that has just started.
    let rows = contenders.size
      ? await db.select(ENTRY_COLUMNS).from(schema.users)
          .where(and(eq(schema.users.status, "active"), inArray(schema.users.id, [...contenders])))
      : [];
    if (rows.length < limit) {
      const have = new Set(rows.map((r) => r.userId));
      const filler = await db.select(ENTRY_COLUMNS).from(schema.users)
        .where(eq(schema.users.status, "active"))
        .orderBy(desc(schema.users.voteCount), desc(schema.users.profileViews))
        .limit(limit + have.size);
      for (const f of filler) {
        if (rows.length >= limit) break;
        if (!have.has(f.userId)) { rows.push(f); have.add(f.userId); }
      }
    }

    // Which of these has the viewer already backed this week?
    let mine = new Set<string>();
    if (opts.viewerId && rows.length) {
      const voted = await db.select({ profileUserId: schema.profileVotes.profileUserId })
        .from(schema.profileVotes)
        .where(and(
          eq(schema.profileVotes.voterUserId, opts.viewerId),
          week.phase === "voting"
            ? eq(schema.profileVotes.weekKey, week.key)
            : isNull(schema.profileVotes.weekKey),
        ));
      mine = new Set(voted.map((v) => v.profileUserId));
    }

    const entries: WeekEntry[] = rows.map((r) => {
      const theme = (r.theme ?? {}) as { accent?: string; accent2?: string; bgImage?: string | null };
      const bonus = adjust.get(r.userId) ?? 0;
      return {
        rank: 0,
        userId: r.userId,
        slug: r.slug,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
        bannerUrl: r.bannerUrl,
        bgImage: theme.bgImage ?? null,
        accent: theme.accent || "#8b5cf6",
        accent2: theme.accent2 || "#22d3ee",
        title: r.title,
        country: r.country,
        // A negative adjustment can't take somebody below zero — a leaderboard
        // showing "-3 votes" reads as a bug rather than as a penalty.
        weekVotes: Math.max(0, (counted.get(r.userId) ?? 0) + bonus),
        lifetimeVotes: r.lifetimeVotes ?? 0,
        adjustment: bonus,
        disqualified: dq.has(r.userId),
        votedByMe: mine.has(r.userId),
      };
    });

    // Disqualified gamers stay visible, at the bottom, marked. Removing them
    // makes the competition look like it never happened, which is exactly the
    // wrong message when somebody has been penalised in public.
    entries.sort((a, b) =>
      Number(a.disqualified) - Number(b.disqualified)
      || b.weekVotes - a.weekVotes
      || b.lifetimeVotes - a.lifetimeVotes
      || a.displayName.localeCompare(b.displayName));
    entries.forEach((e, i) => { e.rank = e.disqualified ? 0 : i + 1; });

    const row = stored[0];
    // The prize is part of the announcement — "you won" without showing what
    // you won is half a ceremony, and the winner needs somewhere to go next.
    let trophy: WeekTrophy = null;
    const trophyId = row?.podium?.find((p) => p.trophyId)?.trophyId;
    if (row?.closedAt && trophyId) {
      const [t] = await db.select({
        id: schema.trophies.id, name: schema.trophies.name, imageUrl: schema.trophies.imageUrl,
        tier: schema.trophies.tier, value: schema.trophies.value,
      }).from(schema.trophies).where(eq(schema.trophies.id, trophyId)).limit(1);
      if (t) trophy = { ...t, value: Number(t.value) };
    }

    return {
      week,
      entries: entries.slice(0, limit),
      votingOpen: win.open,
      closedReason: win.closedReason,
      stream: {
        url: row?.streamUrl || settings[STREAM_URL_KEY] || null,
        live: row?.streamLive || settings[STREAM_LIVE_KEY] === "1",
      },
      result: row?.closedAt
        ? { podium: row.podium ?? [], announcedAt: row.announcedAt ?? null, trophy }
        : null,
      takenAt: new Date().toISOString(),
    };
  } catch { return empty; }
}

/** One gamer's standing — for their own profile page. */
export async function gamerWeekVotes(userId: string, weekKey?: string): Promise<{ week: number; lifetime: number }> {
  try {
    const db = await getDb();
    const key = weekKey ?? (await currentWeek()).key;
    const [[voted], [user], adj] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(schema.profileVotes)
        .where(and(eq(schema.profileVotes.profileUserId, userId), eq(schema.profileVotes.weekKey, key))),
      db.select({ n: schema.users.voteCount }).from(schema.users).where(eq(schema.users.id, userId)).limit(1),
      db.select({ delta: schema.voteWeekActions.delta }).from(schema.voteWeekActions)
        .where(and(
          eq(schema.voteWeekActions.weekKey, key),
          eq(schema.voteWeekActions.profileUserId, userId),
          eq(schema.voteWeekActions.action, "adjust"),
        )),
    ]);
    const bonus = adj.reduce((n, a) => n + a.delta, 0);
    return { week: Math.max(0, Number(voted?.n ?? 0) + bonus), lifetime: user?.n ?? 0 };
  } catch { return { week: 0, lifetime: 0 }; }
}

// ===== Staff actions =====

export async function recordWeekAction(input: {
  weekKey: string;
  profileUserId: string;
  action: "disqualify" | "reinstate" | "adjust";
  delta?: number;
  reason?: string;
  actorId?: string | null;
}): Promise<boolean> {
  try {
    const db = await getDb();
    await db.insert(schema.voteWeekActions).values({
      id: uid(),
      weekKey: input.weekKey,
      profileUserId: input.profileUserId,
      action: input.action,
      delta: input.action === "adjust" ? Math.trunc(input.delta ?? 0) : 0,
      reason: (input.reason ?? "").slice(0, 500),
      actorId: input.actorId ?? null,
    });
    return true;
  } catch { return false; }
}

export async function weekActions(weekKey: string): Promise<{
  id: string; profileUserId: string; slug: string; displayName: string;
  action: string; delta: number; reason: string; actor: string | null; at: Date;
}[]> {
  try {
    const db = await getDb();
    const rows = await db.select({
      id: schema.voteWeekActions.id,
      profileUserId: schema.voteWeekActions.profileUserId,
      slug: schema.users.slug,
      displayName: schema.users.displayName,
      action: schema.voteWeekActions.action,
      delta: schema.voteWeekActions.delta,
      reason: schema.voteWeekActions.reason,
      actorId: schema.voteWeekActions.actorId,
      at: schema.voteWeekActions.createdAt,
    })
      .from(schema.voteWeekActions)
      .innerJoin(schema.users, eq(schema.voteWeekActions.profileUserId, schema.users.id))
      .where(eq(schema.voteWeekActions.weekKey, weekKey))
      .orderBy(desc(schema.voteWeekActions.createdAt))
      .limit(200);

    const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))] as string[];
    const actors = actorIds.length
      ? await db.select({ id: schema.users.id, name: schema.users.displayName })
          .from(schema.users).where(inArray(schema.users.id, actorIds))
      : [];
    const byId = new Map(actors.map((a) => [a.id, a.name]));
    return rows.map((r) => ({ ...r, actor: r.actorId ? byId.get(r.actorId) ?? null : null }));
  } catch { return []; }
}

/** Weeks that have been closed, newest first — the results archive. */
export async function closedWeeks(limit = 12): Promise<{
  weekKey: string;
  podium: { userId: string; slug: string; displayName: string; votes: number }[];
  announcedAt: Date | null;
}[]> {
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.voteWeeks)
      .orderBy(desc(schema.voteWeeks.weekKey)).limit(limit);
    return rows
      .filter((r) => r.closedAt)
      .map((r) => ({ weekKey: r.weekKey, podium: r.podium ?? [], announcedAt: r.announcedAt }));
  } catch { return []; }
}

/** The most recently called result, for the band on a quiet day. */
export async function lastResult(): Promise<{ weekKey: string; podium: { slug: string; displayName: string; votes: number }[] } | null> {
  const [latest] = await closedWeeks(1);
  return latest ? { weekKey: latest.weekKey, podium: latest.podium } : null;
}

export { previousWeek };

// ===== Closing a week =====

export type CloseResult =
  | { ok: true; podium: { userId: string; slug: string; displayName: string; votes: number }[]; trophies: number }
  | { ok: false; reason: "no_entries" | "error" };

/**
 * Call a week: freeze its podium, hand out the trophies, tell the winners.
 *
 * The standings are WRITTEN here rather than recomputed on read, because they
 * depend on votes, adjustments and disqualifications that all keep changing
 * afterwards — and last Sunday's winner has to stay last Sunday's winner.
 *
 * Re-running is safe: the podium is overwritten, and trophy awards are keyed so
 * a second pass adds nothing. That matters because closing is the one action
 * somebody will press twice when a stream stalls.
 */
export async function closeWeek(weekKey: string, actorId?: string | null): Promise<CloseResult> {
  try {
    const db = await getDb();
    // Wider than the three we want, because the filter below drops entries: the
    // board pads itself with zero-vote profiles and keeps disqualified gamers on
    // it. Reading exactly three and then filtering would make the podium's depth
    // depend on the board's sort order, which is not a thing the ceremony should
    // be able to lose to.
    const board = await weekBoard({ weekKey, limit: 30 });
    const podium = board.entries
      .filter((e) => !e.disqualified && e.weekVotes > 0)
      .slice(0, 3)
      .map((e) => ({ userId: e.userId, slug: e.slug, displayName: e.displayName, votes: e.weekVotes }));
    if (!podium.length) return { ok: false, reason: "no_entries" };

    // The trophy staff picked for the podium, if any. Without one the week
    // still closes — the result is the point, the trophy is a bonus.
    let trophyId: string | null = null;
    try {
      const c = await getContent([PODIUM_TROPHY_KEY]);
      trophyId = c[PODIUM_TROPHY_KEY]?.trim() || null;
    } catch { /* no trophy configured */ }

    let trophies = 0;
    if (trophyId) {
      for (const [i, p] of podium.entries()) {
        try {
          await db.insert(schema.userTrophies).values({
            id: uid(),
            userId: p.userId,
            trophyId,
            // Filed under the week, so a second close finds the same row and
            // the same gamer can win again in a later week.
            challengeId: `week:${weekKey}`,
            placement: i + 1,
          }).onConflictDoNothing();
          trophies++;
        } catch { /* a missing trophy row shouldn't stop the announcement */ }
      }
    }

    for (const [i, p] of podium.entries()) {
      try {
        await db.insert(schema.notifications).values({
          id: uid(),
          userId: p.userId,
          type: "badge",
          title: i === 0 ? "You are Profile of the Week" : `You finished #${i + 1} this week`,
          body: trophyId
            ? `${p.votes.toLocaleString()} votes. Your trophy is in your trophy case — open it to redeem.`
            : `${p.votes.toLocaleString()} votes.`,
          href: "/profile",
        }).onConflictDoNothing();
      } catch { /* non-fatal */ }
    }

    const now = new Date();
    await db.insert(schema.voteWeeks)
      .values({ weekKey, podium: podium.map((p, i) => ({ ...p, trophyId: i < 3 ? trophyId : null })), announcedAt: now, closedAt: now })
      .onConflictDoUpdate({
        target: schema.voteWeeks.weekKey,
        set: { podium: podium.map((p, i) => ({ ...p, trophyId: i < 3 ? trophyId : null })), announcedAt: now, closedAt: now },
      });

    if (actorId) {
      await recordWeekAction({
        weekKey, profileUserId: podium[0].userId, action: "adjust", delta: 0,
        reason: `Week closed — ${podium.map((p, i) => `#${i + 1} ${p.displayName}`).join(", ")}`,
        actorId,
      });
    }
    return { ok: true, podium, trophies };
  } catch { return { ok: false, reason: "error" }; }
}

/** Undo a close, so a mistake on stream can be corrected. */
export async function reopenWeek(weekKey: string): Promise<boolean> {
  try {
    const db = await getDb();
    await db.update(schema.voteWeeks)
      .set({ closedAt: null, announcedAt: null, podium: [] })
      .where(eq(schema.voteWeeks.weekKey, weekKey));
    return true;
  } catch { return false; }
}

/** The stream, per week — set and toggled from admin. */
export async function setWeekStream(weekKey: string, url: string | null, live: boolean): Promise<boolean> {
  try {
    const db = await getDb();
    await db.insert(schema.voteWeeks)
      .values({ weekKey, streamUrl: url, streamLive: live })
      .onConflictDoUpdate({ target: schema.voteWeeks.weekKey, set: { streamUrl: url, streamLive: live } });
    return true;
  } catch { return false; }
}
