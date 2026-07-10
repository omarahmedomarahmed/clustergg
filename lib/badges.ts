import { and, count, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";
import { uid } from "@/lib/utils";

// Criteria shapes (badges.criteria JSONB):
//   { type: "account_linked", provider?: string }
//   { type: "accounts_linked_count", min: number }
//   { type: "stat_threshold", metric: string, game?: string, min: number }
//   { type: "follower_count", min: number }
//   { type: "community_activity", posts_min?: number, reactions_received_min?: number }
//   { type: "challenge_result", placement: "top1" | "top3" }  (awarded by challenge finalizer)
//   { type: "expert_tier", tier: "contributor" | "helper" | "expert" }

export async function evaluateBadgesForUser(db: DB, userId: string): Promise<string[]> {
  const allBadges = await db.select().from(schema.badges).where(eq(schema.badges.isActive, true));
  const owned = await db.select({ badgeId: schema.userBadges.badgeId })
    .from(schema.userBadges).where(eq(schema.userBadges.userId, userId));
  const ownedSet = new Set(owned.map((o) => o.badgeId));
  const pending = allBadges.filter((b) => !ownedSet.has(b.id));
  if (pending.length === 0) return [];

  const [accounts, stats, [followerRow], [postRow], reactionRows, expertRows] = await Promise.all([
    db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, userId)),
    db.select().from(schema.statCurrent).where(
      inArray(schema.statCurrent.linkedAccountId,
        db.select({ id: schema.linkedGameAccounts.id }).from(schema.linkedGameAccounts)
          .where(eq(schema.linkedGameAccounts.userId, userId)))),
    db.select({ c: count() }).from(schema.follows).where(eq(schema.follows.followingId, userId)),
    db.select({ c: count() }).from(schema.posts)
      .where(and(eq(schema.posts.authorId, userId), sql`${schema.posts.deletedAt} IS NULL`)),
    db.select({ c: count() }).from(schema.postReactions)
      .innerJoin(schema.posts, eq(schema.postReactions.postId, schema.posts.id))
      .where(and(eq(schema.posts.authorId, userId), eq(schema.postReactions.reactionType, "like"))),
    db.select().from(schema.spaceExpertScores).where(eq(schema.spaceExpertScores.userId, userId)),
  ]);

  const followerCount = Number(followerRow?.c ?? 0);
  const postCount = Number(postRow?.c ?? 0);
  const likesReceived = Number(reactionRows[0]?.c ?? 0);
  const tiers = new Set(expertRows.map((r) => r.tier).filter(Boolean));

  const awarded: string[] = [];
  for (const badge of pending) {
    const c = badge.criteria as Record<string, unknown>;
    let earned = false;
    switch (c.type) {
      case "account_linked":
        earned = accounts.some((a) => (!c.provider || a.provider === c.provider) && a.syncStatus !== "revoked");
        break;
      case "accounts_linked_count":
        earned = accounts.length >= Number(c.min ?? 1);
        break;
      case "stat_threshold":
        earned = stats.some((s) =>
          s.metricKey === c.metric && (!c.game || s.game === c.game) && s.metricValue >= Number(c.min ?? 0));
        break;
      case "follower_count":
        earned = followerCount >= Number(c.min ?? 1);
        break;
      case "community_activity":
        earned = postCount >= Number(c.posts_min ?? 0) && likesReceived >= Number(c.reactions_received_min ?? 0);
        break;
      case "expert_tier":
        earned = tiers.has(String(c.tier));
        break;
      default:
        earned = false; // challenge_result badges are granted by the challenge finalizer
    }
    if (earned) {
      await db.insert(schema.userBadges)
        .values({ id: uid(), userId, badgeId: badge.id }).onConflictDoNothing();
      await db.insert(schema.notifications).values({
        id: uid(), userId, type: "badge",
        title: `Badge earned: ${badge.name}`,
        body: badge.description, href: "/profile",
      });
      awarded.push(badge.code);
    }
  }
  return awarded;
}

export async function grantBadgeByCode(db: DB, userId: string, code: string, context?: string) {
  const [badge] = await db.select().from(schema.badges).where(eq(schema.badges.code, code)).limit(1);
  if (!badge) return;
  await db.insert(schema.userBadges)
    .values({ id: uid(), userId, badgeId: badge.id, context }).onConflictDoNothing();
  await db.insert(schema.notifications).values({
    id: uid(), userId, type: "badge",
    title: `Badge earned: ${badge.name}`, body: badge.description, href: "/profile",
  });
}
