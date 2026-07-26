import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { awardQuestAction } from "@/lib/quests";
import { voteWindow } from "@/lib/profile-week";

// The gamer identity layer: votes, views, and the analytics a gamer sees about
// their own profile.
//
// Votes come from two places on purpose. On the web a signed-in gamer votes
// from a profile page. In Discord, anyone in a server can vote for someone
// they're showing off — requiring a sign-up first would kill the exact moment
// a server rallies behind one of their own. Both are one-vote-per-identity,
// enforced by partial unique indexes rather than by trusting the caller.

export type VoteSource = "web" | "discord";

export type VoteResult =
  | { ok: true; added: boolean; removed: boolean; votes: number; weekVotes: number }
  | { ok: false; reason: "self" | "not_found" | "error" | "closed" };

// Lifetime total, denormalised onto the user so every list that sorts by votes
// doesn't have to count rows.
async function recount(profileUserId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ n: sql<number>`count(*)` })
    .from(schema.profileVotes)
    .where(eq(schema.profileVotes.profileUserId, profileUserId));
  const votes = Number(row?.n ?? 0);
  await db.update(schema.users).set({ voteCount: votes }).where(eq(schema.users.id, profileUserId));
  return votes;
}

// Votes banked to one week — the number the competition actually ranks on.
async function countWeek(profileUserId: string, weekKey: string | null): Promise<number> {
  if (!weekKey) return 0;
  const db = await getDb();
  const [row] = await db.select({ n: sql<number>`count(*)` })
    .from(schema.profileVotes)
    .where(and(
      eq(schema.profileVotes.profileUserId, profileUserId),
      eq(schema.profileVotes.weekKey, weekKey),
    ));
  return Number(row?.n ?? 0);
}

// Web vote — toggles, because a vote you can't take back is a trap.
export async function toggleWebVote(profileUserId: string, voterUserId: string): Promise<VoteResult> {
  if (profileUserId === voterUserId) return { ok: false, reason: "self" };
  try {
    const win = await voteWindow();
    if (!win.open) return { ok: false, reason: "closed" };
    const db = await getDb();

    // One vote per voter per profile per WEEK. Scoped to the week the vote
    // would bank to, so backing the same gamer again next Monday is a new vote
    // rather than an un-vote of the old one.
    const [existing] = await db.select({ id: schema.profileVotes.id })
      .from(schema.profileVotes)
      .where(and(
        eq(schema.profileVotes.profileUserId, profileUserId),
        eq(schema.profileVotes.voterUserId, voterUserId),
        win.bankTo ? eq(schema.profileVotes.weekKey, win.bankTo) : isNull(schema.profileVotes.weekKey),
      )).limit(1);

    if (existing) {
      await db.delete(schema.profileVotes).where(eq(schema.profileVotes.id, existing.id));
      return {
        ok: true, added: false, removed: true,
        votes: await recount(profileUserId), weekVotes: await countWeek(profileUserId, win.bankTo),
      };
    }

    await db.insert(schema.profileVotes).values({
      id: uid(), profileUserId, voterUserId, source: "web", weekKey: win.bankTo,
    });
    const votes = await recount(profileUserId);
    await awardQuestAction(db, profileUserId, "profile_vote_received", { refType: "vote", refId: voterUserId });
    return { ok: true, added: true, removed: false, votes, weekVotes: await countWeek(profileUserId, win.bankTo) };
  } catch { return { ok: false, reason: "error" }; }
}

// Discord vote — keyed on the Discord snowflake, so a member who has never
// signed in can still back someone. Not a toggle: in a channel, an accidental
// second press should be a no-op, not an un-vote.
export async function castDiscordVote(
  profileUserId: string,
  voterDiscordId: string,
  guildId?: string | null,
): Promise<VoteResult> {
  try {
    const db = await getDb();

    // Don't let someone vote for themselves via Discord either.
    const [own] = await db.select({ userId: schema.oauthIdentities.userId })
      .from(schema.oauthIdentities)
      .where(and(
        eq(schema.oauthIdentities.provider, "discord"),
        eq(schema.oauthIdentities.providerUserId, voterDiscordId),
      )).limit(1);
    if (own?.userId === profileUserId) return { ok: false, reason: "self" };

    const win = await voteWindow();
    if (!win.open) return { ok: false, reason: "closed" };

    const [existing] = await db.select({ id: schema.profileVotes.id })
      .from(schema.profileVotes)
      .where(and(
        eq(schema.profileVotes.profileUserId, profileUserId),
        eq(schema.profileVotes.voterDiscordId, voterDiscordId),
        win.bankTo ? eq(schema.profileVotes.weekKey, win.bankTo) : isNull(schema.profileVotes.weekKey),
      )).limit(1);
    if (existing) {
      return {
        ok: true, added: false, removed: false,
        votes: await recount(profileUserId), weekVotes: await countWeek(profileUserId, win.bankTo),
      };
    }

    await db.insert(schema.profileVotes).values({
      id: uid(), profileUserId, voterDiscordId, guildId: guildId ?? null, source: "discord", weekKey: win.bankTo,
    });
    const votes = await recount(profileUserId);
    await awardQuestAction(db, profileUserId, "profile_vote_received", { refType: "vote", refId: voterDiscordId });
    return { ok: true, added: true, removed: false, votes, weekVotes: await countWeek(profileUserId, win.bankTo) };
  } catch { return { ok: false, reason: "error" }; }
}

// "Have I already backed them?" — scoped to the week the answer is about, so a
// vote button reflects THIS week's race rather than something from March.
export async function hasVoted(profileUserId: string, voterUserId?: string | null, voterDiscordId?: string | null): Promise<boolean> {
  if (!voterUserId && !voterDiscordId) return false;
  try {
    const win = await voteWindow();
    const db = await getDb();
    const [row] = await db.select({ id: schema.profileVotes.id })
      .from(schema.profileVotes)
      .where(and(
        eq(schema.profileVotes.profileUserId, profileUserId),
        voterUserId
          ? eq(schema.profileVotes.voterUserId, voterUserId)
          : eq(schema.profileVotes.voterDiscordId, voterDiscordId!),
        win.bankTo ? eq(schema.profileVotes.weekKey, win.bankTo) : isNull(schema.profileVotes.weekKey),
      )).limit(1);
    return !!row;
  } catch { return false; }
}

// ===== Views =====

// Record that a profile was seen. Discord views are counted separately so a
// gamer can tell where their reach is actually coming from.
export async function recordProfileView(profileUserId: string, opts: {
  source: VoteSource;
  guildId?: string | null; guildName?: string | null;
  viewerUserId?: string | null; viewerDiscordId?: string | null;
} ): Promise<void> {
  try {
    const db = await getDb();
    // Don't count someone looking at their own profile.
    if (opts.viewerUserId && opts.viewerUserId === profileUserId) return;

    await db.insert(schema.profileViews).values({
      id: uid(), profileUserId, source: opts.source,
      guildId: opts.guildId ?? null, guildName: opts.guildName ?? null,
      viewerUserId: opts.viewerUserId ?? null, viewerDiscordId: opts.viewerDiscordId ?? null,
    });

    await db.update(schema.users)
      .set(opts.source === "discord"
        ? { profileViews: sql`${schema.users.profileViews} + 1`, discordViews: sql`${schema.users.discordViews} + 1` }
        : { profileViews: sql`${schema.users.profileViews} + 1` })
      .where(eq(schema.users.id, profileUserId));

    // Every 25 views is worth CP on the Orbit quest — award on the crossing.
    const [u] = await db.select({ views: schema.users.profileViews })
      .from(schema.users).where(eq(schema.users.id, profileUserId)).limit(1);
    if (u && u.views > 0 && u.views % 25 === 0) {
      await awardQuestAction(db, profileUserId, "profile_views_25", { refType: "views", refId: String(u.views) });
    }
  } catch { /* a view counter must never break a page render */ }
}

// ===== A gamer's own analytics =====

export type ProfileAnalytics = {
  totalViews: number;
  webViews: number;
  discordViews: number;
  votes: number;
  webVotes: number;
  discordVotes: number;
  servers: { guildId: string; name: string; views: number; votes: number }[];
  rank: number | null;
};

export async function profileAnalytics(userId: string): Promise<ProfileAnalytics> {
  const empty: ProfileAnalytics = {
    totalViews: 0, webViews: 0, discordViews: 0, votes: 0, webVotes: 0, discordVotes: 0,
    servers: [], rank: null,
  };
  try {
    const db = await getDb();
    const [views, votes, user] = await Promise.all([
      db.select({ source: schema.profileViews.source, guildId: schema.profileViews.guildId, guildName: schema.profileViews.guildName })
        .from(schema.profileViews).where(eq(schema.profileViews.profileUserId, userId)),
      db.select({ source: schema.profileVotes.source, guildId: schema.profileVotes.guildId })
        .from(schema.profileVotes).where(eq(schema.profileVotes.profileUserId, userId)),
      db.select({ views: schema.users.profileViews, discordViews: schema.users.discordViews, voteCount: schema.users.voteCount })
        .from(schema.users).where(eq(schema.users.id, userId)).limit(1),
    ]);

    const byServer = new Map<string, { guildId: string; name: string; views: number; votes: number }>();
    for (const v of views) {
      if (!v.guildId) continue;
      const e = byServer.get(v.guildId) ?? { guildId: v.guildId, name: v.guildName || v.guildId, views: 0, votes: 0 };
      e.views++; byServer.set(v.guildId, e);
    }
    for (const v of votes) {
      if (!v.guildId) continue;
      const e = byServer.get(v.guildId) ?? { guildId: v.guildId, name: v.guildId, views: 0, votes: 0 };
      e.votes++; byServer.set(v.guildId, e);
    }

    // Where they sit in the Best Profile race.
    const better = await db.select({ n: sql<number>`count(*)` }).from(schema.users)
      .where(sql`${schema.users.voteCount} > ${user[0]?.voteCount ?? 0}`);

    return {
      totalViews: user[0]?.views ?? views.length,
      discordViews: user[0]?.discordViews ?? views.filter((v) => v.source === "discord").length,
      webViews: (user[0]?.views ?? views.length) - (user[0]?.discordViews ?? 0),
      votes: user[0]?.voteCount ?? votes.length,
      webVotes: votes.filter((v) => v.source === "web").length,
      discordVotes: votes.filter((v) => v.source === "discord").length,
      servers: [...byServer.values()].sort((a, b) => b.views - a.views),
      rank: (user[0]?.voteCount ?? 0) > 0 ? Number(better[0]?.n ?? 0) + 1 : null,
    };
  } catch { return empty; }
}

// ===== Best Profile board =====

export type BestProfileRow = {
  userId: string; slug: string; displayName: string; avatarUrl: string | null;
  votes: number; views: number; rank: number;
};

export async function bestProfiles(limit = 10): Promise<BestProfileRow[]> {
  try {
    const db = await getDb();
    const rows = await db.select({
      userId: schema.users.id, slug: schema.users.slug, displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl, votes: schema.users.voteCount, views: schema.users.profileViews,
    })
      .from(schema.users)
      .where(and(eq(schema.users.status, "active"), eq(schema.users.profileVisibility, "public")))
      .orderBy(desc(schema.users.voteCount), desc(schema.users.profileViews))
      .limit(limit);
    return rows.filter((r) => r.votes > 0).map((r, i) => ({ ...r, rank: i + 1 }));
  } catch { return []; }
}
