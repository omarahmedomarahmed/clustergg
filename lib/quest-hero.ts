import { and, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getUserQuests, getTotalCp, type QuestView, type QuestGamer } from "@/lib/quests";

// The data the in-hero quest map needs: the primary quest (fully), who reached
// each of its tiers, the tab list, AND every quest's variant so the hero can
// switch quests in-frame (feed/home) without navigating.
export type QuestHeroData = {
  quest: QuestView;
  tierHolders: Record<string, QuestGamer[]>;
  tabs: { key: string; name: string; color: string; logoUrl: string | null; icon: string; mapArtUrl: string | null }[];
  variants: { key: string; quest: QuestView; tierHolders: Record<string, QuestGamer[]> }[];
  totalCp: number;
};

export async function getQuestHeroData(db: DB, userId: string | null): Promise<QuestHeroData | null> {
  const quests = await getUserQuests(db, userId);
  if (quests.length === 0) return null;
  const totalCp = await getTotalCp(db, userId);

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

  const variants = quests.map((q) => ({ key: q.key, quest: q, tierHolders: holdersFor(q) }));
  const tabs = quests.map((q) => ({ key: q.key, name: q.name, color: q.color, logoUrl: q.logoUrl, icon: q.icon, mapArtUrl: q.mapArtUrl }));
  return { quest: quests[0], tierHolders: holdersFor(quests[0]), tabs, variants, totalCp };
}
