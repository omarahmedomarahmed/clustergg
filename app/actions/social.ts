"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { uid } from "@/lib/utils";
import { evaluateBadgesForUser } from "@/lib/badges";
import { recomputeExpertScores } from "@/lib/experts";

// ---------- Follows ----------
export async function toggleFollow(targetUserId: string, path: string) {
  const me = await requireUser();
  if (me.id === targetUserId) return;
  const db = await getDb();
  const [existing] = await db.select().from(schema.follows).where(and(
    eq(schema.follows.followerId, me.id),
    eq(schema.follows.followingId, targetUserId),
  )).limit(1);
  if (existing) {
    await db.delete(schema.follows).where(and(
      eq(schema.follows.followerId, me.id),
      eq(schema.follows.followingId, targetUserId),
    ));
  } else {
    await db.insert(schema.follows).values({ followerId: me.id, followingId: targetUserId }).onConflictDoNothing();
    await db.insert(schema.notifications).values({
      id: uid(), userId: targetUserId, type: "follow",
      title: `${me.displayName} started following you`, href: `/u/${me.slug}`,
    });
    try { await evaluateBadgesForUser(db, targetUserId); } catch { /* non-fatal */ }
  }
  revalidatePath(path);
}

// ---------- Spaces ----------
export async function toggleSpaceMembership(spaceId: string, path: string) {
  const me = await requireUser();
  const db = await getDb();
  const [existing] = await db.select().from(schema.spaceMembers).where(and(
    eq(schema.spaceMembers.spaceId, spaceId),
    eq(schema.spaceMembers.userId, me.id),
  )).limit(1);
  if (existing) {
    await db.delete(schema.spaceMembers).where(and(
      eq(schema.spaceMembers.spaceId, spaceId),
      eq(schema.spaceMembers.userId, me.id),
    ));
    await db.update(schema.spaces).set({ memberCount: sql`GREATEST(${schema.spaces.memberCount} - 1, 0)` })
      .where(eq(schema.spaces.id, spaceId));
  } else {
    await db.insert(schema.spaceMembers).values({ spaceId, userId: me.id }).onConflictDoNothing();
    await db.update(schema.spaces).set({ memberCount: sql`${schema.spaces.memberCount} + 1` })
      .where(eq(schema.spaces.id, spaceId));
  }
  revalidatePath(path);
}

export async function createPost(spaceId: string, spaceSlug: string, formData: FormData) {
  const me = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 5000) return;
  const db = await getDb();
  await db.insert(schema.posts).values({ id: uid(), spaceId, authorId: me.id, body });
  await db.update(schema.spaces).set({ postCount: sql`${schema.spaces.postCount} + 1` })
    .where(eq(schema.spaces.id, spaceId));
  await db.insert(schema.spaceMembers).values({ spaceId, userId: me.id }).onConflictDoNothing();
  try { await recomputeExpertScores(db, spaceId); await evaluateBadgesForUser(db, me.id); } catch { /* non-fatal */ }
  revalidatePath(`/spaces/${spaceSlug}`);
}

export async function reactToPost(postId: string, reactionType: "like" | "dislike" | "meh", path: string) {
  const me = await requireUser();
  const db = await getDb();
  const [existing] = await db.select().from(schema.postReactions).where(and(
    eq(schema.postReactions.postId, postId),
    eq(schema.postReactions.userId, me.id),
  )).limit(1);
  if (existing?.reactionType === reactionType) {
    await db.delete(schema.postReactions).where(and(
      eq(schema.postReactions.postId, postId),
      eq(schema.postReactions.userId, me.id),
    ));
  } else if (existing) {
    await db.update(schema.postReactions).set({ reactionType }).where(and(
      eq(schema.postReactions.postId, postId),
      eq(schema.postReactions.userId, me.id),
    ));
  } else {
    await db.insert(schema.postReactions).values({ postId, userId: me.id, reactionType });
  }
  revalidatePath(path);
}

export async function addComment(postId: string, parentCommentId: string | null, path: string, formData: FormData) {
  const me = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 2000) return;
  const db = await getDb();
  await db.insert(schema.comments).values({ id: uid(), postId, parentCommentId, authorId: me.id, body });
  revalidatePath(path);
}

export async function requestNewSpace(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  const me = await requireUser();
  const proposedName = String(formData.get("proposedName") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (proposedName.length < 2) return { error: "Give the space a name." };
  if (reason.length < 10) return { error: "Tell us a bit more about why (10+ characters)." };
  const db = await getDb();
  await db.insert(schema.spaceRequests).values({ id: uid(), requestedBy: me.id, proposedName, reason });
  return { ok: true };
}

// ---------- Messages ----------
export async function startConversation(targetUserId: string) {
  const me = await requireUser();
  if (me.id === targetUserId) redirect("/messages");
  const db = await getDb();

  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, targetUserId)).limit(1);
  if (!target) redirect("/messages");
  if (target.allowMessagesFrom === "nobody") redirect(`/u/${target.slug}?dm=blocked`);
  if (target.allowMessagesFrom === "following") {
    const [follows] = await db.select().from(schema.follows).where(and(
      eq(schema.follows.followerId, targetUserId),
      eq(schema.follows.followingId, me.id),
    )).limit(1);
    if (!follows) redirect(`/u/${target.slug}?dm=blocked`);
  }

  const mine = await db.select({ id: schema.conversationParticipants.conversationId })
    .from(schema.conversationParticipants)
    .where(eq(schema.conversationParticipants.userId, me.id));
  if (mine.length > 0) {
    const [shared] = await db.select({ id: schema.conversationParticipants.conversationId })
      .from(schema.conversationParticipants)
      .where(and(
        eq(schema.conversationParticipants.userId, targetUserId),
        inArray(schema.conversationParticipants.conversationId, mine.map((m) => m.id)),
      )).limit(1);
    if (shared) redirect(`/messages/${shared.id}`);
  }

  const convId = uid();
  await db.insert(schema.conversations).values({ id: convId });
  await db.insert(schema.conversationParticipants).values([
    { conversationId: convId, userId: me.id },
    { conversationId: convId, userId: targetUserId },
  ]);
  redirect(`/messages/${convId}`);
}

export async function sendMessage(conversationId: string, formData: FormData) {
  const me = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 4000) return;
  const db = await getDb();
  const [participant] = await db.select().from(schema.conversationParticipants).where(and(
    eq(schema.conversationParticipants.conversationId, conversationId),
    eq(schema.conversationParticipants.userId, me.id),
  )).limit(1);
  if (!participant) return;
  await db.insert(schema.messages).values({ id: uid(), conversationId, senderId: me.id, body });
  await db.update(schema.conversations).set({ lastMessageAt: new Date() })
    .where(eq(schema.conversations.id, conversationId));
  revalidatePath(`/messages/${conversationId}`);
}

// ---------- Notifications ----------
export async function markAllNotificationsRead() {
  const me = await requireUser();
  const db = await getDb();
  await db.update(schema.notifications).set({ readAt: new Date() })
    .where(eq(schema.notifications.userId, me.id));
  revalidatePath("/notifications");
}

// ---------- Challenges ----------
export async function joinChallenge(challengeId: string, linkedAccountId: string, path: string) {
  const me = await requireUser();
  const db = await getDb();
  const [challenge] = await db.select().from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId)).limit(1);
  if (!challenge || challenge.status !== "active") return;
  const [account] = await db.select().from(schema.linkedGameAccounts).where(and(
    eq(schema.linkedGameAccounts.id, linkedAccountId),
    eq(schema.linkedGameAccounts.userId, me.id),
  )).limit(1);
  if (!account || account.provider !== challenge.provider) return;

  // Snapshot current stats as the baseline: only activity AFTER joining counts.
  const stats = await db.select().from(schema.statCurrent)
    .where(eq(schema.statCurrent.linkedAccountId, account.id));
  const baseline: Record<string, number> = {};
  for (const s of stats) baseline[s.metricKey] = s.metricValue;

  await db.insert(schema.challengeParticipants).values({
    id: uid(), challengeId, userId: me.id, linkedAccountId: account.id, baseline,
  }).onConflictDoNothing();
  revalidatePath(path);
}
