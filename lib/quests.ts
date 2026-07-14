import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";

// ===== Action catalog =====
// The set of trackable actions the engine knows how to emit. A quest "listens"
// to any subset via its actionWeights map, so admins can point any quest at any
// action. `group` is only the default quest an action ships attached to.
export type QuestActionKey =
  | "join_challenge" | "finish_challenge" | "top3_challenge" | "win_challenge"
  | "join_planet" | "write_post" | "write_comment" | "reaction_given" | "reaction_received"
  | "follower_gained" | "message_new" | "profile_views_25"
  | "connect_account" | "stat_levelup"
  | "ad_impression" | "ad_click";

export const ACTION_CATALOG: { key: QuestActionKey; label: string; group: string; defaultWeight: number; defaultCap?: number }[] = [
  { key: "join_challenge",   label: "Join a challenge",        group: "conquest",  defaultWeight: 15, defaultCap: 5 },
  { key: "finish_challenge", label: "Finish a challenge",      group: "conquest",  defaultWeight: 25 },
  { key: "top3_challenge",   label: "Place top 3",             group: "conquest",  defaultWeight: 150 },
  { key: "win_challenge",    label: "Win a challenge (1st)",   group: "conquest",  defaultWeight: 400 },
  { key: "join_planet",      label: "Join a planet",           group: "orbit",     defaultWeight: 20 },
  { key: "write_post",       label: "Write a post",            group: "orbit",     defaultWeight: 10, defaultCap: 10 },
  { key: "write_comment",    label: "Write a comment",         group: "orbit",     defaultWeight: 5, defaultCap: 20 },
  { key: "reaction_given",   label: "React to a post",         group: "orbit",     defaultWeight: 2, defaultCap: 30 },
  { key: "reaction_received",label: "Get a reaction",          group: "orbit",     defaultWeight: 3, defaultCap: 50 },
  { key: "follower_gained",  label: "Gain a follower",         group: "orbit",     defaultWeight: 8 },
  { key: "message_new",      label: "Message a new gamer",     group: "orbit",     defaultWeight: 4, defaultCap: 15 },
  { key: "profile_views_25", label: "Every 25 profile views",  group: "orbit",     defaultWeight: 10 },
  { key: "connect_account",  label: "Connect a game account",  group: "ascension", defaultWeight: 120 },
  { key: "stat_levelup",     label: "A tracked stat rises",    group: "ascension", defaultWeight: 25, defaultCap: 20 },
  { key: "ad_impression",    label: "See an ad (impression)",  group: "signal",    defaultWeight: 1, defaultCap: 60 },
  { key: "ad_click",         label: "Click an ad",             group: "signal",    defaultWeight: 5, defaultCap: 10 },
];

export const ACTION_LABEL: Record<string, string> = Object.fromEntries(ACTION_CATALOG.map((a) => [a.key, a.label]));

// Cosmic quest emblem art (Higgsfield nano_banana). Served directly from the
// CDN like the planet skins; admins can replace any of these in /admin/quests.
const HF = "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082";
export const QUEST_EMBLEMS: Record<string, string> = {
  conquest: `${HF}/hf_20260714_193856_ea53f06e-b44d-4473-b67c-b3c2a2a736c7.png`,
  orbit: `${HF}/hf_20260714_193903_a1b522be-910a-49df-8904-b4fbbf832f97.png`,
  ascension: `${HF}/hf_20260714_193907_7a60de0d-d719-4228-860e-6ec7b44b1b31.png`,
  // signal emblem pending regeneration (daily gen limit) — falls back to its icon.
};

// ===== Default quests (seeded once; fully editable afterwards) =====
type DefaultTier = { name: string; description: string; thresholdQp: number };
type DefaultQuest = {
  key: string; name: string; tagline: string; lore: string; color: string; accent2: string; icon: string;
  sortOrder: number; tiers: DefaultTier[];
};

const TIERS = (a: number, b: number, c: number, d: number, story: [string, string, string, string]): DefaultTier[] => [
  { name: "Bronze", description: story[0], thresholdQp: a },
  { name: "Silver", description: story[1], thresholdQp: b },
  { name: "Gold", description: story[2], thresholdQp: c },
  { name: "Platinum", description: story[3], thresholdQp: d },
];

export const DEFAULT_QUESTS: DefaultQuest[] = [
  {
    key: "conquest", name: "Conquest", tagline: "Win challenges across every game", icon: "trophy",
    color: "#f5b301", accent2: "#ff7847", sortOrder: 0,
    lore: "The arena spans the galaxy. Join challenges, climb the podium, and let every victory echo through the Cluster — no matter which game you conquer it in.",
    tiers: TIERS(100, 400, 1200, 3000, [
      "Enter the arena — join your first challenges.",
      "Taste the podium — start placing top 3.",
      "Serial winner — victories stack up.",
      "Galactic champion — the Cluster knows your name.",
    ]),
  },
  {
    key: "orbit", name: "Orbit", tagline: "Pull other gamers into your gravity", icon: "users",
    color: "#a78bfa", accent2: "#22d3ee", sortOrder: 1,
    lore: "No star shines alone. Join planets, post, react, follow and be followed — grow the constellation that orbits you.",
    tiers: TIERS(100, 400, 1200, 3000, [
      "First contact — join planets and start talking.",
      "Rising signal — people gather around you.",
      "Gravity well — a real community forms.",
      "Supermassive — you bend the whole feed toward you.",
    ]),
  },
  {
    key: "ascension", name: "Ascension", tagline: "Connect games and level them up", icon: "chart",
    color: "#22d3ee", accent2: "#38bdf8", sortOrder: 2,
    lore: "Every account you link is another engine on your ship. Connect more games and push each one higher — the Cluster measures the climb across all of them.",
    tiers: TIERS(120, 480, 1200, 3000, [
      "Ignition — link your first accounts.",
      "Booster stage — more games, more climb.",
      "Orbit achieved — progression across the board.",
      "Ascended — a multi-game force.",
    ]),
  },
  {
    key: "signal", name: "Signal", tagline: "Explore the Cluster and get seen", icon: "zap",
    color: "#fbbf24", accent2: "#f472b6", sortOrder: 3,
    lore: "The more of the galaxy you traverse, the stronger your signal. Just by exploring the Cluster, your beacon grows.",
    tiers: TIERS(60, 240, 720, 1800, [
      "Faint blip — start exploring.",
      "Steady beacon — you're a regular traveler.",
      "Bright pulse — the Cluster is your home.",
      "Pulsar — an ever-present signal.",
    ]),
  },
];

function weightsFor(questKey: string): Record<string, number> {
  return Object.fromEntries(ACTION_CATALOG.filter((a) => a.group === questKey).map((a) => [a.key, a.defaultWeight]));
}
function capsFor(questKey: string): Record<string, number> {
  return Object.fromEntries(ACTION_CATALOG.filter((a) => a.group === questKey && a.defaultCap).map((a) => [a.key, a.defaultCap!]));
}

// Idempotent seed — creates any missing default quest + its tiers by key.
export async function seedQuests(db: DB) {
  for (const q of DEFAULT_QUESTS) {
    const [existing] = await db.select({ id: schema.quests.id }).from(schema.quests).where(eq(schema.quests.key, q.key)).limit(1);
    if (existing) continue;
    const questId = uid();
    await db.insert(schema.quests).values({
      id: questId, key: q.key, name: q.name, tagline: q.tagline, lore: q.lore,
      color: q.color, accent2: q.accent2, icon: q.icon, logoUrl: QUEST_EMBLEMS[q.key] ?? null,
      actionWeights: weightsFor(q.key), dailyCaps: capsFor(q.key), sortOrder: q.sortOrder,
    }).onConflictDoNothing();
    let i = 0;
    for (const t of q.tiers) {
      await db.insert(schema.questTiers).values({
        id: uid(), questId, tierIndex: i++, name: t.name, description: t.description, thresholdQp: t.thresholdQp,
      });
    }
  }
}

// Backfill emblem art onto default quests that don't have a logo yet — never
// clobbers an admin upload. Idempotent; safe to run every boot-maintenance.
export async function ensureQuestArt(db: DB) {
  for (const [key, url] of Object.entries(QUEST_EMBLEMS)) {
    await db.update(schema.quests).set({ logoUrl: url })
      .where(and(eq(schema.quests.key, key), isNull(schema.quests.logoUrl)));
  }
}

// ===== Award engine =====
function startOfUtcDay(): Date { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; }

// Credit an action to every quest that listens to it. Dedup + daily caps are
// enforced per (user, quest, action, ref). Unlocks tier badges + notifies.
export async function awardQuestAction(
  db: DB, userId: string, actionKey: QuestActionKey, ref?: { refType?: string; refId?: string },
): Promise<void> {
  try {
    const activeQuests = await db.select().from(schema.quests).where(eq(schema.quests.isActive, true));
    const listening = activeQuests.filter((q) => Number((q.actionWeights as Record<string, number>)[actionKey] ?? 0) > 0);
    if (listening.length === 0) return;

    for (const quest of listening) {
      const weight = Number((quest.actionWeights as Record<string, number>)[actionKey] ?? 0);
      if (weight <= 0) continue;
      const cap = Number((quest.dailyCaps as Record<string, number>)[actionKey] ?? 0);

      if (cap > 0) {
        const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(schema.questEvents)
          .where(and(eq(schema.questEvents.userId, userId), eq(schema.questEvents.questId, quest.id),
            eq(schema.questEvents.actionKey, actionKey), gte(schema.questEvents.createdAt, startOfUtcDay())));
        if (Number(c) >= cap) continue;
      }

      // Dedup: skip if this exact (quest, action, ref) was already counted.
      const refType = ref?.refType ?? "";
      const refId = ref?.refId ?? "";
      const [dupe] = await db.select({ id: schema.questEvents.id }).from(schema.questEvents).where(and(
        eq(schema.questEvents.userId, userId), eq(schema.questEvents.questId, quest.id),
        eq(schema.questEvents.actionKey, actionKey), eq(schema.questEvents.refType, refType), eq(schema.questEvents.refId, refId),
      )).limit(1);
      if (dupe) continue;
      await db.insert(schema.questEvents).values({
        id: uid(), userId, questId: quest.id, actionKey, qpAwarded: weight, refType, refId,
      }).onConflictDoNothing();

      // Bump QP.
      await db.insert(schema.userQuestProgress).values({ userId, questId: quest.id, qp: weight })
        .onConflictDoUpdate({
          target: [schema.userQuestProgress.userId, schema.userQuestProgress.questId],
          set: { qp: sql`${schema.userQuestProgress.qp} + ${weight}`, updatedAt: new Date() },
        });

      await unlockTiers(db, userId, quest.id, quest.name);
    }
  } catch { /* gamification is non-fatal — never block the underlying action */ }
}

// Award any tier badges the user's current QP now clears.
async function unlockTiers(db: DB, userId: string, questId: string, questName: string) {
  const [prog] = await db.select({ qp: schema.userQuestProgress.qp }).from(schema.userQuestProgress)
    .where(and(eq(schema.userQuestProgress.userId, userId), eq(schema.userQuestProgress.questId, questId))).limit(1);
  const qp = prog?.qp ?? 0;
  const tiers = await db.select().from(schema.questTiers)
    .where(and(eq(schema.questTiers.questId, questId), eq(schema.questTiers.isActive, true)));
  const earned = tiers.filter((t) => qp >= t.thresholdQp);
  if (earned.length === 0) return;

  const already = await db.select({ id: schema.userQuestTiers.questTierId }).from(schema.userQuestTiers)
    .where(and(eq(schema.userQuestTiers.userId, userId), inArray(schema.userQuestTiers.questTierId, earned.map((t) => t.id))));
  const have = new Set(already.map((r) => r.id));
  for (const t of earned) {
    if (have.has(t.id)) continue;
    await db.insert(schema.userQuestTiers).values({ id: uid(), userId, questTierId: t.id }).onConflictDoNothing();
    await db.insert(schema.notifications).values({
      id: uid(), userId, type: "badge",
      title: `${t.name} unlocked in ${questName}!`,
      body: t.description, href: "/quests",
    });
  }
}

// ===== Read models =====
export type QuestTierView = { id: string; name: string; description: string; thresholdQp: number; iconUrl: string | null; color: string | null; earned: boolean };
export type QuestView = {
  id: string; key: string; name: string; tagline: string; lore: string; color: string; accent2: string; icon: string;
  logoUrl: string | null; cardBgUrl: string | null; coverUrl: string | null;
  qp: number; tiers: QuestTierView[]; currentTierIndex: number; nextTier: QuestTierView | null;
};

export async function getUserQuests(db: DB, userId: string | null): Promise<QuestView[]> {
  const quests = await db.select().from(schema.quests).where(eq(schema.quests.isActive, true)).orderBy(schema.quests.sortOrder);
  if (quests.length === 0) return [];
  const questIds = quests.map((q) => q.id);
  const [tiers, progress, earned] = await Promise.all([
    db.select().from(schema.questTiers).where(and(inArray(schema.questTiers.questId, questIds), eq(schema.questTiers.isActive, true))),
    userId ? db.select().from(schema.userQuestProgress).where(and(eq(schema.userQuestProgress.userId, userId), inArray(schema.userQuestProgress.questId, questIds))) : Promise.resolve([]),
    userId ? db.select({ tierId: schema.userQuestTiers.questTierId }).from(schema.userQuestTiers).where(eq(schema.userQuestTiers.userId, userId)) : Promise.resolve([]),
  ]);
  const qpByQuest = new Map(progress.map((p) => [p.questId, p.qp]));
  const earnedSet = new Set(earned.map((e) => e.tierId));

  return quests.map((q) => {
    const qp = qpByQuest.get(q.id) ?? 0;
    const qTiers = tiers.filter((t) => t.questId === q.id).sort((a, b) => a.tierIndex - b.tierIndex)
      .map((t): QuestTierView => ({ id: t.id, name: t.name, description: t.description, thresholdQp: t.thresholdQp, iconUrl: t.iconUrl, color: t.color, earned: earnedSet.has(t.id) || qp >= t.thresholdQp }));
    const currentTierIndex = qTiers.reduce((acc, t, i) => (qp >= t.thresholdQp ? i : acc), -1);
    const nextTier = qTiers.find((t) => qp < t.thresholdQp) ?? null;
    return {
      id: q.id, key: q.key, name: q.name, tagline: q.tagline, lore: q.lore, color: q.color, accent2: q.accent2, icon: q.icon,
      logoUrl: q.logoUrl, cardBgUrl: q.cardBgUrl, coverUrl: q.coverUrl,
      qp, tiers: qTiers, currentTierIndex, nextTier,
    };
  });
}

// Leaderboard: how many gamers have unlocked each quest's tiers, top questers.
export async function getQuestLeaderboards(db: DB) {
  const quests = await db.select().from(schema.quests).where(eq(schema.quests.isActive, true)).orderBy(schema.quests.sortOrder);
  if (quests.length === 0) return [];
  const questIds = quests.map((q) => q.id);
  const [tiers, tierCounts, topRows] = await Promise.all([
    db.select().from(schema.questTiers).where(inArray(schema.questTiers.questId, questIds)),
    db.select({ tierId: schema.userQuestTiers.questTierId, c: sql<number>`count(*)` }).from(schema.userQuestTiers).groupBy(schema.userQuestTiers.questTierId),
    db.select({ questId: schema.userQuestProgress.questId, userId: schema.userQuestProgress.userId, qp: schema.userQuestProgress.qp, name: schema.users.displayName, slug: schema.users.slug, avatarUrl: schema.users.avatarUrl })
      .from(schema.userQuestProgress).innerJoin(schema.users, eq(schema.userQuestProgress.userId, schema.users.id))
      .where(eq(schema.users.status, "active")).orderBy(desc(schema.userQuestProgress.qp)).limit(200),
  ]);
  const countByTier = new Map(tierCounts.map((r) => [r.tierId, Number(r.c)]));
  return quests.map((q) => {
    const qTiers = tiers.filter((t) => t.questId === q.id).sort((a, b) => a.tierIndex - b.tierIndex);
    const top = topRows.filter((r) => r.questId === q.id).slice(0, 10);
    return {
      quest: q,
      tiers: qTiers.map((t) => ({ id: t.id, name: t.name, thresholdQp: t.thresholdQp, holders: countByTier.get(t.id) ?? 0 })),
      top,
    };
  });
}
