import { and, desc, eq, lt, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { awardQuestAction, getQuestCompletions } from "@/lib/quests";
import { announceChallengeJoined, announceChallengeEnded } from "@/lib/discord/announce";

// Joining a challenge, in one place.
//
// The website joins through a server action with a cookie session; the Discord
// bot joins on behalf of a gamer it identified by their Discord snowflake.
// Both must apply the SAME rules — entry gate, baseline snapshot, quest award —
// or a Discord join would quietly be worth more or less than a web join.

export type JoinResult =
  | { ok: true; already: boolean; game: string; title: string }
  | { ok: false; reason: "not_found" | "not_active" | "no_account" | "gated" };

export async function joinChallengeFor(
  userId: string,
  challengeId: string,
  opts: { linkedAccountId?: string; source?: "web" | "discord" } = {},
): Promise<JoinResult> {
  const db = await getDb();
  const [challenge] = await db.select().from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId)).limit(1);
  if (!challenge) return { ok: false, reason: "not_found" };
  if (challenge.status !== "active") return { ok: false, reason: "not_active" };

  // The account must be one of theirs AND match the challenge's provider —
  // you can't enter a Valorant challenge with a Chess account.
  const accounts = await db.select().from(schema.linkedGameAccounts)
    .where(and(
      eq(schema.linkedGameAccounts.userId, userId),
      eq(schema.linkedGameAccounts.provider, challenge.provider),
    ));
  const account = opts.linkedAccountId
    ? accounts.find((a) => a.id === opts.linkedAccountId)
    : accounts[0];
  if (!account) return { ok: false, reason: "no_account" };

  // Quest-badge entry gate: require N completion badges of a given quest.
  if (challenge.gateQuestId && challenge.gateMinBadges > 0) {
    const have = await getQuestCompletions(db, userId, challenge.gateQuestId);
    if (have < challenge.gateMinBadges) return { ok: false, reason: "gated" };
  }

  const [existing] = await db.select({ id: schema.challengeParticipants.id })
    .from(schema.challengeParticipants)
    .where(and(
      eq(schema.challengeParticipants.challengeId, challengeId),
      eq(schema.challengeParticipants.userId, userId),
    )).limit(1);
  if (existing) return { ok: true, already: true, game: challenge.game, title: challenge.title };

  // Snapshot current stats as the baseline: only activity AFTER joining counts.
  const stats = await db.select().from(schema.statCurrent)
    .where(eq(schema.statCurrent.linkedAccountId, account.id));
  const baseline: Record<string, number> = {};
  for (const s of stats) baseline[s.metricKey] = s.metricValue;

  await db.insert(schema.challengeParticipants).values({
    id: uid(), challengeId, userId, linkedAccountId: account.id, baseline,
    joinedFrom: opts.source ?? "web",
  }).onConflictDoNothing();
  await awardQuestAction(db, userId, "join_challenge", { refType: "challenge", refId: challengeId });

  // Tell the Discord servers watching. Deliberately not awaited into the
  // result: a failed announcement must never fail the join.
  void announceChallengeJoined(userId, challengeId).catch(() => {});

  return { ok: true, already: false, game: challenge.game, title: challenge.title };
}

// The web URL for a challenge. There is no top-level /challenges route — a
// challenge lives on its game's planet — so links must resolve the planet slug
// rather than guessing a path that 404s.
export async function challengeUrl(base: string, challengeId: string): Promise<string> {
  try {
    const db = await getDb();
    const [ch] = await db.select({ game: schema.challenges.game })
      .from(schema.challenges).where(eq(schema.challenges.id, challengeId)).limit(1);
    if (!ch) return `${base}/planets`;
    const [space] = await db.select({ slug: schema.spaces.slug })
      .from(schema.spaces).where(eq(schema.spaces.game, ch.game)).limit(1);
    return space ? `${base}/planets/${space.slug}/challenges/${challengeId}` : `${base}/planets`;
  } catch { return `${base}/planets`; }
}

// Live challenges, optionally for one game. Shared by the bot's challenge
// screens and anywhere else that needs "what's on right now".
// `guildId` scopes visibility: inside a server you see the public challenges
// PLUS that server's own private ones. Anywhere else, only the public ones —
// a server-exclusive challenge that leaked into other servers wouldn't be
// exclusive, and that exclusivity is the whole product for an owner.
export async function liveChallenges(game?: string | null, limit = 8, guildId?: string | null) {
  const db = await getDb();
  const visible = guildId
    ? or(eq(schema.challenges.visibility, "public"), eq(schema.challenges.guildId, guildId))
    : eq(schema.challenges.visibility, "public");
  const where = game
    ? and(eq(schema.challenges.status, "active"), eq(schema.challenges.game, game), visible)
    : and(eq(schema.challenges.status, "active"), visible);
  return db.select().from(schema.challenges).where(where).orderBy(schema.challenges.endAt).limit(limit);
}

// Can this viewer open this challenge? Public ones: always. Private ones: only
// from the owning server, or with the access key.
export async function canSeeChallenge(
  challenge: { visibility: string | null; guildId: string | null; accessKey: string | null },
  ctx: { guildId?: string | null; accessKey?: string | null },
): Promise<boolean> {
  if ((challenge.visibility ?? "public") !== "private") return true;
  if (challenge.guildId && ctx.guildId && challenge.guildId === ctx.guildId) return true;
  return !!challenge.accessKey && challenge.accessKey === ctx.accessKey;
}

// ===== Ending a challenge =====

export type StandingRow = {
  userId: string; displayName: string; slug: string; avatarUrl: string | null;
  points: number; place: number; inGameName: string | null;
};

// Live standings, ranked. The same ordering is used for the in-flight
// leaderboard and for freezing final placements, so what people watched all
// week is exactly what decides the trophies.
export async function challengeStandings(challengeId: string, limit = 50): Promise<StandingRow[]> {
  try {
    const db = await getDb();
    const rows = await db.select({
      userId: schema.challengeParticipants.userId,
      points: schema.challengeParticipants.currentPoints,
      displayName: schema.users.displayName,
      slug: schema.users.slug,
      avatarUrl: schema.users.avatarUrl,
      inGameName: schema.linkedGameAccounts.inGameName,
    })
      .from(schema.challengeParticipants)
      .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
      .leftJoin(schema.linkedGameAccounts, eq(schema.challengeParticipants.linkedAccountId, schema.linkedGameAccounts.id))
      .where(and(
        eq(schema.challengeParticipants.challengeId, challengeId),
        eq(schema.challengeParticipants.status, "active"),
      ))
      .orderBy(desc(schema.challengeParticipants.currentPoints))
      .limit(limit);
    return rows.map((r, i) => ({ ...r, place: i + 1 }));
  } catch { return []; }
}

export type CloseResult = { ok: boolean; winners: number; reason?: string };

// End a challenge for good: freeze the standings into finalPlacement, mark it
// completed, and hand out the trophies.
//
// This is deliberately idempotent — a cron, an admin button and a retry can all
// call it, and only the first one does anything.
export async function closeChallenge(challengeId: string): Promise<CloseResult> {
  const db = await getDb();
  const [c] = await db.select().from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId)).limit(1);
  if (!c) return { ok: false, winners: 0, reason: "not_found" };
  if (c.status === "completed") return { ok: true, winners: 0, reason: "already_completed" };

  const standings = await challengeStandings(challengeId, 500);

  // Freeze placements first — awardChallengeTrophies reads finalPlacement, and
  // it must never see a half-written podium.
  for (const s of standings) {
    await db.update(schema.challengeParticipants)
      .set({ finalPlacement: s.place, status: "completed" })
      .where(and(
        eq(schema.challengeParticipants.challengeId, challengeId),
        eq(schema.challengeParticipants.userId, s.userId),
      ));
  }

  await db.update(schema.challenges)
    .set({ status: "completed" })
    .where(eq(schema.challenges.id, challengeId));

  const { awardChallengeTrophies } = await import("@/lib/trophies");
  await awardChallengeTrophies(db, challengeId);

  // Everyone who took part hears how they finished, not just the podium.
  for (const s of standings) {
    try {
      await db.insert(schema.notifications).values({
        id: uid(), userId: s.userId, type: "challenge",
        title: `${c.title} has ended`,
        body: s.place <= 3
          ? `You finished #${s.place} with ${s.points} points — your trophy is in your trophy case.`
          : `You finished #${s.place} of ${standings.length} with ${s.points} points.`,
        href: "/profile",
      }).onConflictDoNothing();
    } catch { /* non-fatal */ }
  }

  void announceChallengeEnded(challengeId).catch(() => {});
  return { ok: true, winners: Math.min(3, standings.length) };
}

// Every active challenge whose end date has passed. Run daily.
//
// Note what this REPLACES: challenge windows used to be pushed forward on every
// boot for any challenge with a daily/weekly/monthly cadence, so challenges
// never actually ended and trophies were never awarded. Cadence now describes
// how often staff intend to run a NEW one, not a window that slides forever.
export async function closeExpiredChallenges(): Promise<{ closed: number; ids: string[] }> {
  try {
    const db = await getDb();
    const due = await db.select({ id: schema.challenges.id })
      .from(schema.challenges)
      .where(and(
        eq(schema.challenges.status, "active"),
        lt(schema.challenges.endAt, new Date()),
      ));
    const ids: string[] = [];
    for (const c of due) {
      const res = await closeChallenge(c.id);
      if (res.ok && res.reason !== "already_completed") ids.push(c.id);
    }
    return { closed: ids.length, ids };
  } catch { return { closed: 0, ids: [] }; }
}
