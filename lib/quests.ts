import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
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
// Glorified unified-style quest badges (hexagonal cosmic medals).
export const QUEST_EMBLEMS: Record<string, string> = {
  conquest: `${HF}/hf_20260717_223341_7969f811-bb66-45b0-b589-756f32d7c034.png`,
  orbit: `${HF}/hf_20260717_223622_deb3e6f8-a5ac-4ac4-a321-1b19d0facbfb.png`,
  ascension: `${HF}/hf_20260717_223625_d4b96822-41d1-4b3b-a0f0-dd9bae1d7ca7.png`,
  signal: `${HF}/hf_20260717_223627_90984c2b-6b28-41f0-8e65-558acb2adfa0.png`,
};
// The previous emblems — replaced automatically by the new badges (admin
// uploads are preserved since they won't match these).
const OLD_QUEST_EMBLEMS: string[] = [
  `${HF}/hf_20260714_193856_ea53f06e-b44d-4473-b67c-b3c2a2a736c7.png`,
  `${HF}/hf_20260714_193903_a1b522be-910a-49df-8904-b4fbbf832f97.png`,
  `${HF}/hf_20260714_193907_7a60de0d-d719-4228-860e-6ec7b44b1b31.png`,
  `${HF}/hf_20260715_113609_7865c988-053e-4808-bc82-3451222db943.png`,
];
// Big glorified Cluster Points (CP) currency icon — shown wherever CP appears.
export const CP_ICON = `${HF}/hf_20260717_223629_251d5972-a1bc-4e38-8724-1ea35bf10f18.png`;
// Gamified cosmic card backgrounds per quest (subtle, dark, text-safe).
export const QUEST_CARD_BGS: Record<string, string> = {
  conquest: `${HF}/hf_20260715_113645_4eb3d18c-2808-4d26-a38e-359ca5e78dbc.png`,
  orbit: `${HF}/hf_20260715_113649_4dcef232-cee5-4d48-b950-0d3f4907289a.png`,
  ascension: `${HF}/hf_20260715_113657_a4ea0800-d986-4490-aa9d-209106e6d192.png`,
  signal: `${HF}/hf_20260715_113701_940a9b02-30e1-413e-9a91-dabb9acb6f8f.png`,
};
// Flat-earth 3D quest MAP art (one themed world per quest), used as the
// treasure-map hero. Background-REMOVED (transparent) so the page's own space
// background shows behind the floating map, per the brief. Each is a themed world.
export const QUEST_MAP_ART: Record<string, string> = {
  conquest: `${HF}/hf_20260718_162555_8d13e694-bdd8-41bd-8360-0d1d20c1abfc.png`,
  orbit: `${HF}/hf_20260718_162600_f4c2d883-7673-4e36-9b34-dd900b24c841.png`,
  ascension: `${HF}/hf_20260718_163045_7327cc89-ffcb-4a8e-8a43-c009912d42d9.png`,
  signal: `${HF}/hf_20260718_163048_d3642044-d3b7-4ad3-a41c-88a63b515085.png`,
};
// Previous map arts (the space-background versions) + their Blob-rehosted forms —
// replaced automatically by the transparent versions. Admin uploads that aren't
// in this list are preserved.
const OLD_QUEST_MAPS: string[] = [
  `${HF}/hf_20260717_223300_12943977-905f-4e3e-9c9e-c13b988d95d9.png`,
  `${HF}/hf_20260717_223301_8726e058-02b7-439c-a7f0-d598bbcfa036.png`,
  `${HF}/hf_20260717_223318_e48ad818-64ca-4910-9f3d-39ac838d9967.png`,
  `${HF}/hf_20260717_223321_558cd40f-903d-440b-ae2f-2b01bb01cffd.png`,
  "https://k97i8qtht2q1jooh.public.blob.vercel-storage.com/uploads/quest/1AXVB8Q1upPepaf2.png",
  "https://k97i8qtht2q1jooh.public.blob.vercel-storage.com/uploads/quest/mAwM4hbLnEBcoefs.png",
  "https://k97i8qtht2q1jooh.public.blob.vercel-storage.com/uploads/quest/tGZbt6sc-47O5gmd.png",
  "https://k97i8qtht2q1jooh.public.blob.vercel-storage.com/uploads/quest/zrNCa78zgvvMoP2k.png",
];

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
      color: q.color, accent2: q.accent2, icon: q.icon,
      logoUrl: QUEST_EMBLEMS[q.key] ?? null, cardBgUrl: QUEST_CARD_BGS[q.key] ?? null,
      actionWeights: weightsFor(q.key), dailyCaps: capsFor(q.key), sortOrder: q.sortOrder,
    }).onConflictDoNothing();
    const n = q.tiers.length;
    let i = 0;
    for (const t of q.tiers) {
      const [x, y] = mapPos(i, n);
      await db.insert(schema.questTiers).values({
        id: uid(), questId, tierIndex: i, name: t.name, description: t.description, thresholdQp: t.thresholdQp, mapX: x, mapY: y,
      });
      i++;
    }
  }
}

// Spread tier pins along a gentle left→right winding path across the map.
function mapPos(i: number, n: number): [number, number] {
  const x = Math.round(12 + 76 * (n > 1 ? i / (n - 1) : 0.5));
  const y = i % 2 === 0 ? 40 : 64;
  return [x, y];
}

// Backfill emblem art onto default quests that don't have a logo yet — never
// clobbers an admin upload. Idempotent; safe to run every boot-maintenance.
export async function ensureQuestArt(db: DB) {
  for (const [key, url] of Object.entries(QUEST_EMBLEMS)) {
    // Set the new badge where there's no logo OR the logo is a previous default
    // (so we upgrade the art without clobbering an admin's own upload).
    await db.update(schema.quests).set({ logoUrl: url })
      .where(and(eq(schema.quests.key, key), or(isNull(schema.quests.logoUrl), inArray(schema.quests.logoUrl, OLD_QUEST_EMBLEMS))));
  }
  for (const [key, url] of Object.entries(QUEST_CARD_BGS)) {
    await db.update(schema.quests).set({ cardBgUrl: url })
      .where(and(eq(schema.quests.key, key), isNull(schema.quests.cardBgUrl)));
  }
  for (const [key, url] of Object.entries(QUEST_MAP_ART)) {
    // Upgrade to the transparent map where there's none OR the current art is a
    // previous default / its Blob-rehosted form (admin uploads are preserved).
    await db.update(schema.quests).set({ mapArtUrl: url })
      .where(and(eq(schema.quests.key, key), or(isNull(schema.quests.mapArtUrl), inArray(schema.quests.mapArtUrl, OLD_QUEST_MAPS))));
  }
  // Spread map pins for any quest whose tiers are all still at the default
  // center (50/50) — so the standalone map hero shows a real path, not a stack.
  const quests = await db.select({ id: schema.quests.id }).from(schema.quests);
  for (const q of quests) {
    const tiers = await db.select().from(schema.questTiers).where(eq(schema.questTiers.questId, q.id)).orderBy(schema.questTiers.tierIndex);
    if (tiers.length > 1 && tiers.every((t) => t.mapX === 50 && t.mapY === 50)) {
      for (let i = 0; i < tiers.length; i++) {
        const [x, y] = mapPos(i, tiers.length);
        await db.update(schema.questTiers).set({ mapX: x, mapY: y }).where(eq(schema.questTiers.id, tiers[i].id));
      }
    }
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
      await maybeCompleteQuest(db, userId, quest.id, quest.name);
    }
  } catch { /* gamification is non-fatal — never block the underlying action */ }
}

// When current-cycle QP passes the top tier, the quest is "completed": award a
// completion (badge ×N), bank the CP into lifetimeQp, and re-enroll by carrying
// the remainder into a fresh cycle — so total CP keeps stacking forever.
async function maybeCompleteQuest(db: DB, userId: string, questId: string, questName: string) {
  const [prog] = await db.select({ qp: schema.userQuestProgress.qp }).from(schema.userQuestProgress)
    .where(and(eq(schema.userQuestProgress.userId, userId), eq(schema.userQuestProgress.questId, questId))).limit(1);
  const [top] = await db.select({ t: schema.questTiers.thresholdQp }).from(schema.questTiers)
    .where(and(eq(schema.questTiers.questId, questId), eq(schema.questTiers.isActive, true)))
    .orderBy(desc(schema.questTiers.thresholdQp)).limit(1);
  const maxThreshold = Number(top?.t ?? 0);
  let qp = prog?.qp ?? 0;
  if (maxThreshold <= 0 || qp < maxThreshold) return;

  let completed = 0;
  while (qp >= maxThreshold) { qp -= maxThreshold; completed++; }
  await db.update(schema.userQuestProgress)
    .set({ qp, completions: sql`${schema.userQuestProgress.completions} + ${completed}`, lifetimeQp: sql`${schema.userQuestProgress.lifetimeQp} + ${maxThreshold * completed}`, updatedAt: new Date() })
    .where(and(eq(schema.userQuestProgress.userId, userId), eq(schema.userQuestProgress.questId, questId)));
  await db.insert(schema.notifications).values({
    id: uid(), userId, type: "badge",
    title: `Quest complete: ${questName}! 🏆`,
    body: `You finished ${questName}${completed > 1 ? ` ×${completed}` : ""} — re-enrolled from the start, and your total CP keeps stacking.`,
    href: "/quests",
  });
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
export type QuestGamer = { name: string; slug: string; avatarUrl: string | null; qp?: number };
export type QuestTierView = { id: string; name: string; description: string; thresholdQp: number; iconUrl: string | null; color: string | null; mapX: number; mapY: number; earned: boolean; holders: number };
export type QuestView = {
  id: string; key: string; name: string; tagline: string; lore: string; color: string; accent2: string; icon: string;
  logoUrl: string | null; cardBgUrl: string | null; coverUrl: string | null; mapArtUrl: string | null;
  qp: number; tiers: QuestTierView[]; currentTierIndex: number; nextTier: QuestTierView | null;
  completions: number; totalCp: number;
};

async function tierHolderCountMap(db: DB, tierIds: string[]): Promise<Map<string, number>> {
  if (tierIds.length === 0) return new Map();
  const rows = await db.select({ tierId: schema.userQuestTiers.questTierId, c: sql<number>`count(*)` })
    .from(schema.userQuestTiers).where(inArray(schema.userQuestTiers.questTierId, tierIds)).groupBy(schema.userQuestTiers.questTierId);
  return new Map(rows.map((r) => [r.tierId, Number(r.c)]));
}

export async function getUserQuests(db: DB, userId: string | null): Promise<QuestView[]> {
  const quests = await db.select().from(schema.quests).where(eq(schema.quests.isActive, true)).orderBy(schema.quests.sortOrder);
  if (quests.length === 0) return [];
  const questIds = quests.map((q) => q.id);
  const [tiers, progress] = await Promise.all([
    db.select().from(schema.questTiers).where(and(inArray(schema.questTiers.questId, questIds), eq(schema.questTiers.isActive, true))),
    userId ? db.select().from(schema.userQuestProgress).where(and(eq(schema.userQuestProgress.userId, userId), inArray(schema.userQuestProgress.questId, questIds))) : Promise.resolve([]),
  ]);
  const holders = await tierHolderCountMap(db, tiers.map((t) => t.id));
  const progByQuest = new Map(progress.map((p) => [p.questId, p]));

  return quests.map((q) => {
    const p = progByQuest.get(q.id);
    const qp = p?.qp ?? 0;
    // "Earned" reflects the CURRENT cycle (re-enroll resets the map); lifetime
    // achievements are the quest badges (completions) shown on the profile.
    const qTiers = tiers.filter((t) => t.questId === q.id).sort((a, b) => a.tierIndex - b.tierIndex)
      .map((t): QuestTierView => ({ id: t.id, name: t.name, description: t.description, thresholdQp: t.thresholdQp, iconUrl: t.iconUrl, color: t.color, mapX: t.mapX, mapY: t.mapY, earned: qp >= t.thresholdQp, holders: holders.get(t.id) ?? 0 }));
    const currentTierIndex = qTiers.reduce((acc, t, i) => (qp >= t.thresholdQp ? i : acc), -1);
    const nextTier = qTiers.find((t) => qp < t.thresholdQp) ?? null;
    const completions = p?.completions ?? 0;
    return {
      id: q.id, key: q.key, name: q.name, tagline: q.tagline, lore: q.lore, color: q.color, accent2: q.accent2, icon: q.icon,
      logoUrl: q.logoUrl, cardBgUrl: q.cardBgUrl, coverUrl: q.coverUrl, mapArtUrl: q.mapArtUrl,
      qp, tiers: qTiers, currentTierIndex, nextTier,
      completions, totalCp: (p?.lifetimeQp ?? 0) + qp,
    };
  });
}

// How many completion badges a gamer holds for a single quest (0 if none).
export async function getQuestCompletions(db: DB, userId: string, questId: string): Promise<number> {
  const [row] = await db.select({ c: schema.userQuestProgress.completions }).from(schema.userQuestProgress)
    .where(and(eq(schema.userQuestProgress.userId, userId), eq(schema.userQuestProgress.questId, questId))).limit(1);
  return Number(row?.c ?? 0);
}

// A gamer's TOTAL Cluster Points across all quests (lifetime + current cycles).
export async function getTotalCp(db: DB, userId: string | null): Promise<number> {
  if (!userId) return 0;
  const [row] = await db.select({ c: sql<number>`COALESCE(SUM(${schema.userQuestProgress.qp} + ${schema.userQuestProgress.lifetimeQp}), 0)` })
    .from(schema.userQuestProgress).where(eq(schema.userQuestProgress.userId, userId));
  return Number(row?.c ?? 0);
}

// ===== CP ledger (history log) =====
export type CpLedgerEntry = {
  id: string; questId: string; questKey: string; questName: string; color: string; logoUrl: string | null;
  actionKey: string; label: string; qp: number; at: string;
};
// Every CP award for a gamer (when + why), newest first. Optionally scoped to
// one quest. Backed by questEvents; the "why" comes from the action label.
export async function getCpLedger(db: DB, userId: string | null, opts?: { questId?: string; limit?: number }): Promise<CpLedgerEntry[]> {
  if (!userId) return [];
  const wheres = [eq(schema.questEvents.userId, userId)];
  if (opts?.questId) wheres.push(eq(schema.questEvents.questId, opts.questId));
  const rows = await db.select({
    id: schema.questEvents.id, questId: schema.questEvents.questId, actionKey: schema.questEvents.actionKey,
    qp: schema.questEvents.qpAwarded, at: schema.questEvents.createdAt,
    key: schema.quests.key, name: schema.quests.name, color: schema.quests.color, logoUrl: schema.quests.logoUrl,
  }).from(schema.questEvents).innerJoin(schema.quests, eq(schema.questEvents.questId, schema.quests.id))
    .where(and(...wheres)).orderBy(desc(schema.questEvents.createdAt)).limit(opts?.limit ?? 120);
  return rows.map((r) => ({
    id: r.id, questId: r.questId, questKey: r.key, questName: r.name, color: r.color, logoUrl: r.logoUrl,
    actionKey: r.actionKey, label: ACTION_LABEL[r.actionKey] ?? r.actionKey, qp: r.qp, at: r.at.toISOString(),
  }));
}

// Top questers per quest (CP leaderboard), keyed by quest id.
export async function getQuestTops(db: DB, questIds: string[], perQuest = 8): Promise<Map<string, QuestGamer[]>> {
  const out = new Map<string, QuestGamer[]>();
  if (questIds.length === 0) return out;
  const rows = await db.select({ questId: schema.userQuestProgress.questId, qp: schema.userQuestProgress.qp, name: schema.users.displayName, slug: schema.users.slug, avatarUrl: schema.users.avatarUrl })
    .from(schema.userQuestProgress).innerJoin(schema.users, eq(schema.userQuestProgress.userId, schema.users.id))
    .where(and(inArray(schema.userQuestProgress.questId, questIds), eq(schema.users.status, "active")))
    .orderBy(desc(schema.userQuestProgress.qp)).limit(perQuest * questIds.length);
  for (const r of rows) {
    const list = out.get(r.questId) ?? [];
    if (list.length < perQuest) { list.push({ name: r.name, slug: r.slug, avatarUrl: r.avatarUrl, qp: r.qp }); out.set(r.questId, list); }
  }
  return out;
}

// Full detail for one quest's standalone page: the view, who reached each tier
// (map step), and the quest's CP leaderboard — plus the light list of all
// quests for the hero toggle.
export async function getQuestByKey(db: DB, key: string, userId: string | null) {
  const all = await getUserQuests(db, userId);
  const quest = all.find((q) => q.key === key);
  if (!quest) return null;
  const tierIds = quest.tiers.map((t) => t.id);
  const [holderRows, tops] = await Promise.all([
    tierIds.length ? db.select({ tierId: schema.userQuestTiers.questTierId, name: schema.users.displayName, slug: schema.users.slug, avatarUrl: schema.users.avatarUrl, at: schema.userQuestTiers.awardedAt })
      .from(schema.userQuestTiers).innerJoin(schema.users, eq(schema.userQuestTiers.userId, schema.users.id))
      .where(and(inArray(schema.userQuestTiers.questTierId, tierIds), eq(schema.users.status, "active")))
      .orderBy(desc(schema.userQuestTiers.awardedAt)).limit(200) : Promise.resolve([]),
    getQuestTops(db, [quest.id], 20),
  ]);
  const tierHolders: Record<string, QuestGamer[]> = {};
  for (const r of holderRows) {
    const list = tierHolders[r.tierId] ?? [];
    if (list.length < 12) { list.push({ name: r.name, slug: r.slug, avatarUrl: r.avatarUrl }); tierHolders[r.tierId] = list; }
  }
  return { quest, allQuests: all, tierHolders, leaderboard: tops.get(quest.id) ?? [] };
}

// Lean quest summary for the nav bar — name, CP, art and progress-to-next-tier
// only (no tier-holder counts), so it's cheap enough to run on every page.
export type NavQuest = { key: string; name: string; color: string; accent2: string; qp: number; art: string | null; logoUrl: string | null; pct: number; nextName: string; earned: boolean };
export async function getNavQuests(db: DB, userId: string | null, limit = 4): Promise<NavQuest[]> {
  const quests = await db.select().from(schema.quests).where(eq(schema.quests.isActive, true)).orderBy(schema.quests.sortOrder).limit(limit);
  if (quests.length === 0) return [];
  const ids = quests.map((q) => q.id);
  const [tiers, progress, seenRow] = await Promise.all([
    db.select().from(schema.questTiers).where(and(inArray(schema.questTiers.questId, ids), eq(schema.questTiers.isActive, true))),
    userId ? db.select().from(schema.userQuestProgress).where(and(eq(schema.userQuestProgress.userId, userId), inArray(schema.userQuestProgress.questId, ids))) : Promise.resolve([]),
    userId ? db.select({ feedPrefs: schema.users.feedPrefs }).from(schema.users).where(eq(schema.users.id, userId)).limit(1) : Promise.resolve([]),
  ]);
  const qpBy = new Map(progress.map((p) => [p.questId, p.qp]));
  // "Seen" CP per quest (persisted in feedPrefs.questSeen) — a quest shows a red
  // dot when the gamer has earned CP in it since they last opened the quest menu.
  const seen = (((seenRow[0]?.feedPrefs ?? {}) as { questSeen?: Record<string, number> }).questSeen) ?? {};
  return quests.map((q) => {
    const qp = qpBy.get(q.id) ?? 0;
    const qTiers = tiers.filter((t) => t.questId === q.id).sort((a, b) => a.tierIndex - b.tierIndex);
    const next = qTiers.find((t) => qp < t.thresholdQp);
    const prevT = [...qTiers].reverse().find((t) => qp >= t.thresholdQp)?.thresholdQp ?? 0;
    const span = next ? next.thresholdQp - prevT : 1;
    const pct = next ? Math.max(4, Math.min(100, Math.round(((qp - prevT) / span) * 100))) : 100;
    return { key: q.key, name: q.name, color: q.color, accent2: q.accent2, qp, art: q.mapArtUrl || q.cardBgUrl || null, logoUrl: q.logoUrl, pct, nextName: next?.name ?? "Max", earned: !!userId && qp > (seen[q.key] ?? 0) };
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
