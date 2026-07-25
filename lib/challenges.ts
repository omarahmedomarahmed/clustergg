import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { awardQuestAction, getQuestCompletions } from "@/lib/quests";
import { announceChallengeJoined } from "@/lib/discord/announce";

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
export async function liveChallenges(game?: string | null, limit = 8) {
  const db = await getDb();
  const where = game
    ? and(eq(schema.challenges.status, "active"), eq(schema.challenges.game, game))
    : eq(schema.challenges.status, "active");
  return db.select().from(schema.challenges).where(where).orderBy(schema.challenges.endAt).limit(limit);
}
