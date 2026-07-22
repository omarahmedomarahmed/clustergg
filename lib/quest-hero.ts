import { and, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getUserQuests, getTotalCp, getCpLedger, getStarterMissions, type QuestView, type QuestGamer } from "@/lib/quests";
import type { QuestGamePayload, QuestLogEntry, QuestPanelArt } from "@/lib/quest-game";
import { getContent } from "@/lib/cms";
import { buildCardBgMap, cardBgCmsKeys, cardBgStyle } from "@/lib/card-bg";

// The data the in-hero quest map needs: the primary quest (fully), who reached
// each of its tiers, the tab list, AND every quest's variant so the hero can
// switch quests in-frame (feed/home) without navigating. Each variant now also
// carries its playable-game payload (rules + the gamer's CP history + missions)
// so the quest game launches straight from the homepage/feed hero.
export type QuestHeroData = {
  quest: QuestView;
  tierHolders: Record<string, QuestGamer[]>;
  tabs: { key: string; name: string; color: string; logoUrl: string | null; icon: string; mapArtUrl: string | null }[];
  variants: { key: string; quest: QuestView; tierHolders: Record<string, QuestGamer[]>; game: QuestGamePayload }[];
  totalCp: number;
};

// Admin-set art for the in-game panels (universal card-background editor).
export async function getQuestPanelArt(): Promise<QuestPanelArt> {
  const map = buildCardBgMap(await getContent(cardBgCmsKeys).catch(() => ({} as Record<string, string>)));
  const dark = "rgba(4,5,26,0.72)"; // panels hold text — keep the veil heavy
  return {
    rules: cardBgStyle(map, "quest_rules", dark),
    log: cardBgStyle(map, "quest_log", dark),
    guide: cardBgStyle(map, "quest_guide", dark),
    missions: cardBgStyle(map, "quest_missions", dark),
  };
}

export async function getQuestHeroData(db: DB, userId: string | null): Promise<QuestHeroData | null> {
  const quests = await getUserQuests(db, userId);
  if (quests.length === 0) return null;
  const [totalCp, fullLedger, missions, art] = await Promise.all([
    getTotalCp(db, userId),
    getCpLedger(db, userId, { limit: 400 }),
    getStarterMissions(db, userId),
    getQuestPanelArt(),
  ]);
  // Split the gamer's CP history per quest for each variant's in-game log.
  const logByQuest = new Map<string, QuestLogEntry[]>();
  for (const e of fullLedger) {
    const list = logByQuest.get(e.questId) ?? [];
    if (list.length < 200) { list.push(e); logByQuest.set(e.questId, list); }
  }

  // Tier holders for EVERY quest's tiers in one query.
  const allTierIds = quests.flatMap((q) => q.tiers.map((t) => t.id));
  const holdersByTier: Record<string, QuestGamer[]> = {};
  if (allTierIds.length) {
    const rows = await db.select({
      tierId: schema.userQuestTiers.questTierId,
      name: schema.users.displayName, slug: schema.users.slug, avatarUrl: schema.users.avatarUrl,
    })
      .from(schema.userQuestTiers)
      .innerJoin(schema.users, eq(schema.userQuestTiers.userId, schema.users.id))
      .where(and(inArray(schema.userQuestTiers.questTierId, allTierIds), eq(schema.users.status, "active")))
      .orderBy(desc(schema.userQuestTiers.awardedAt)).limit(600);
    for (const r of rows) {
      const list = holdersByTier[r.tierId] ?? [];
      if (list.length < 12) { list.push({ name: r.name, slug: r.slug, avatarUrl: r.avatarUrl }); holdersByTier[r.tierId] = list; }
    }
  }

  const holdersFor = (q: QuestView): Record<string, QuestGamer[]> => {
    const out: Record<string, QuestGamer[]> = {};
    for (const t of q.tiers) if (holdersByTier[t.id]) out[t.id] = holdersByTier[t.id];
    return out;
  };
  const gameFor = (q: QuestView): QuestGamePayload => ({
    rules: q.rules, log: logByQuest.get(q.id) ?? [], totalCp, art, missions,
  });

  const variants = quests.map((q) => ({ key: q.key, quest: q, tierHolders: holdersFor(q), game: gameFor(q) }));
  const tabs = quests.map((q) => ({ key: q.key, name: q.name, color: q.color, logoUrl: q.logoUrl, icon: q.icon, mapArtUrl: q.mapArtUrl }));
  return { quest: quests[0], tierHolders: holdersFor(quests[0]), tabs, variants, totalCp };
}
