"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { uid } from "@/lib/utils";
import { evaluateBadgesForUser } from "@/lib/badges";
import { recomputeExpertScores } from "@/lib/experts";
import { awardQuestAction, getQuestCompletions } from "@/lib/quests";

// ---------- Feed control panel ----------
// Persist the gamer's feed dashboard prefs: which stat tiles show + which
// challenges / game-leaderboards they follow. Sent as a JSON blob from the
// FeedControlPanel client component.
export async function saveFeedPrefs(prefsJson: string) {
  const me = await requireUser();
  const db = await getDb();
  // Preserve any existing keys (e.g. dashboard) not present in this partial save.
  const [cur] = await db.select({ feedPrefs: schema.users.feedPrefs }).from(schema.users).where(eq(schema.users.id, me.id)).limit(1);
  const existing = (cur?.feedPrefs ?? {}) as Record<string, unknown>;
  let prefs: Record<string, unknown> = { ...existing };
  try {
    const p = JSON.parse(prefsJson);
    if (Array.isArray(p.stats)) prefs.stats = p.stats.filter((x: unknown) => typeof x === "string").slice(0, 12);
    if (Array.isArray(p.challenges)) prefs.challenges = p.challenges.filter((x: unknown) => typeof x === "string").slice(0, 24);
    if (Array.isArray(p.leaderboards)) prefs.leaderboards = p.leaderboards.filter((x: unknown) => typeof x === "string").slice(0, 24);
    // Dashboard: array of widgets { id, type, w, config }.
    if (Array.isArray(p.dashboard)) {
      prefs.dashboard = p.dashboard.slice(0, 40).map((w: Record<string, unknown>) => ({
        id: String(w.id ?? "").slice(0, 40),
        type: ["quest", "cp", "stat", "leaderboard"].includes(String(w.type)) ? w.type : "quest",
        w: Math.max(1, Math.min(4, Number(w.w) || 1)),
        config: (w.config && typeof w.config === "object") ? w.config : {},
      })).filter((w: { id: string }) => w.id);
    }
  } catch { /* keep existing */ }
  await db.update(schema.users).set({ feedPrefs: prefs }).where(eq(schema.users.id, me.id));
  revalidatePath("/feed");
}

// Mark all quests as "seen" at their current CP — clears the nav red dots. Called
// when the gamer opens the quest menu.
export async function markQuestsSeen() {
  const me = await requireUser();
  const db = await getDb();
  const [[cur], quests] = await Promise.all([
    db.select({ feedPrefs: schema.users.feedPrefs }).from(schema.users).where(eq(schema.users.id, me.id)).limit(1),
    db.select({ key: schema.quests.key, id: schema.quests.id }).from(schema.quests),
  ]);
  const prog = await db.select({ questId: schema.userQuestProgress.questId, qp: schema.userQuestProgress.qp })
    .from(schema.userQuestProgress).where(eq(schema.userQuestProgress.userId, me.id));
  const qpById = new Map(prog.map((p) => [p.questId, p.qp]));
  const questSeen: Record<string, number> = {};
  for (const q of quests) questSeen[q.key] = qpById.get(q.id) ?? 0;
  const prefs: Record<string, unknown> = { ...((cur?.feedPrefs ?? {}) as Record<string, unknown>), questSeen };
  await db.update(schema.users).set({ feedPrefs: prefs as typeof schema.users.$inferInsert.feedPrefs }).where(eq(schema.users.id, me.id));
}

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
    await awardQuestAction(db, targetUserId, "follower_gained", { refType: "follow", refId: me.id });
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
    await awardQuestAction(db, me.id, "join_planet", { refType: "planet", refId: spaceId });
  }
  revalidatePath(path);
}

export async function createPost(spaceId: string, spaceSlug: string, formData: FormData) {
  const me = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 5000) return;
  const db = await getDb();
  const postId = uid();
  await db.insert(schema.posts).values({ id: postId, spaceId, authorId: me.id, body });
  await db.update(schema.spaces).set({ postCount: sql`${schema.spaces.postCount} + 1` })
    .where(eq(schema.spaces.id, spaceId));
  await db.insert(schema.spaceMembers).values({ spaceId, userId: me.id }).onConflictDoNothing();
  try { await recomputeExpertScores(db, spaceId); await evaluateBadgesForUser(db, me.id); } catch { /* non-fatal */ }
  await awardQuestAction(db, me.id, "write_post", { refType: "post", refId: postId });
  revalidatePath(`/planets/${spaceSlug}`);
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
    await awardQuestAction(db, me.id, "reaction_given", { refType: "reaction", refId: postId });
    const [post] = await db.select({ authorId: schema.posts.authorId }).from(schema.posts).where(eq(schema.posts.id, postId)).limit(1);
    if (post && post.authorId !== me.id) {
      await awardQuestAction(db, post.authorId, "reaction_received", { refType: "reaction", refId: `${postId}:${me.id}` });
    }
  }
  revalidatePath(path);
}

export async function addComment(postId: string, parentCommentId: string | null, path: string, formData: FormData) {
  const me = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 2000) return;
  const db = await getDb();
  const commentId = uid();
  await db.insert(schema.comments).values({ id: commentId, postId, parentCommentId, authorId: me.id, body });
  await awardQuestAction(db, me.id, "write_comment", { refType: "comment", refId: commentId });
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
  await awardQuestAction(db, me.id, "message_new", { refType: "dm", refId: targetUserId });
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
    .where(and(eq(schema.notifications.userId, me.id), isNull(schema.notifications.readAt)));
  revalidatePath("/notifications");
  revalidatePath("/", "layout"); // refresh the nav bell badge everywhere
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

  // Quest-badge entry gate: require N completion badges of a given quest.
  if (challenge.gateQuestId && challenge.gateMinBadges > 0) {
    const have = await getQuestCompletions(db, me.id, challenge.gateQuestId);
    if (have < challenge.gateMinBadges) return; // page already hides the button
  }

  // Snapshot current stats as the baseline: only activity AFTER joining counts.
  const stats = await db.select().from(schema.statCurrent)
    .where(eq(schema.statCurrent.linkedAccountId, account.id));
  const baseline: Record<string, number> = {};
  for (const s of stats) baseline[s.metricKey] = s.metricValue;

  await db.insert(schema.challengeParticipants).values({
    id: uid(), challengeId, userId: me.id, linkedAccountId: account.id, baseline,
  }).onConflictDoNothing();
  await awardQuestAction(db, me.id, "join_challenge", { refType: "challenge", refId: challengeId });
  revalidatePath(path);
}
