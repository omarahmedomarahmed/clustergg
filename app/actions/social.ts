"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { uid } from "@/lib/utils";
import { awardQuestAction, getQuestCompletions } from "@/lib/quests";
import { joinChallengeFor, switchChallengeAccount } from "@/lib/challenges";

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

// ===== POSTS, COMMENTS AND REACTIONS ARE GONE. B111 =====
//
// `createPost`, `reactToPost` and `addComment` used to live here. Cluster is a
// competition and earning layer, not a social network, and the feed was the
// part of it nobody used and everybody had to moderate.
//
// FOLLOWING, MESSAGING AND GIFTING STAY. They are how a gamer keeps track of
// people they compete against, and none of them need a post to exist.
//
// The earning half was already retired: `write_post`, `write_comment`,
// `reaction_given` and `reaction_received` sit in `lib/quests.ts` with a weight
// of 0 and "(retired)" in their labels, so nothing here paid CP by the time it
// was removed.
//
// ⚠ THE ROWS ARE STILL THERE, ON PURPOSE. `posts`, `comments`,
// `post_reactions` and `comment_reactions` are user-authored content on a live
// product. Dropping them from `COLUMN_MIGRATIONS` would delete somebody's
// writing on the next boot, irreversibly, as a side effect of a deploy — which
// is not a decision a refactor gets to take. `lib/social-purge.ts` holds the
// deletion behind an explicit admin action, with a count shown first.

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
// Bound as a form action, so the trailing argument is the submitted FormData —
// that's where an entry key comes from for a server-gated challenge.
export async function joinChallenge(challengeId: string, path: string, formData?: FormData) {
  const me = await requireUser();
  const accessKey = formData ? String(formData.get("accessKey") ?? "") : undefined;
  // WHICH account, from the form rather than bound into the action.
  //
  // It used to be bound as `myAccounts[0].id` at render time, so a gamer with a
  // main and a smurf always entered on whichever the query returned first —
  // with no way to say otherwise and no error to notice. The account is now a
  // field the person actually chooses; an empty value still means "the only one
  // I have", which `joinChallengeFor` resolves.
  const linkedAccountId = formData ? String(formData.get("linkedAccountId") ?? "") : "";
  // The rules (provider match, entry gate, access key, baseline snapshot, CP
  // award) live in lib/challenges.ts so a Discord join and a web join are
  // exactly equivalent.
  const res = await joinChallengeFor(me.id, challengeId, {
    ...(linkedAccountId ? { linkedAccountId } : {}),
    source: "web",
    accessKey,
  });
  // B94. An unfinished account cannot enter, and the redirect is the whole
  // answer: the page it lands on is the one that explains why and fixes it in a
  // minute. A toast saying "finish onboarding" with no way there is a dead end.
  if (!res.ok && res.reason === "onboarding") redirect("/onboarding?from=challenge");
  revalidatePath(path);
}

/**
 * Move an entry to another of your accounts, before the challenge starts (B38).
 *
 * A separate action from joining on purpose. Joining again with a different
 * account cannot silently move the entry — that would make "enter" and "change
 * my mind" the same gesture, and one of them is reversible in a way the other
 * is not. This is the deliberate one, and `switchChallengeAccount` refuses it
 * once the challenge has started.
 */
export async function switchEntryAccount(challengeId: string, path: string, formData: FormData) {
  const me = await requireUser();
  const linkedAccountId = String(formData.get("linkedAccountId") ?? "");
  if (!linkedAccountId) return;
  await switchChallengeAccount(me.id, challengeId, linkedAccountId);
  revalidatePath(path);
}
