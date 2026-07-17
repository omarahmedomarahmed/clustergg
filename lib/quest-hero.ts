import { and, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getUserQuests, type QuestView, type QuestGamer } from "@/lib/quests";

// The data the in-hero quest map needs: the primary quest (fully), who reached
// each of its tiers, and the light list of all quests for the toggle tabs.
export type QuestHeroData = {
  quest: QuestView;
  tierHolders: Record<string, QuestGamer[]>;
  tabs: { key: string; name: string; color: string; logoUrl: string | null; icon: string; mapArtUrl: string | null }[];
};

export async function getQuestHeroData(db: DB, userId: string | null): Promise<QuestHeroData | null> {
  const quests = await getUserQuests(db, userId);
  if (quests.length === 0) return null;
  const primary = quests[0];
  const tierIds = primary.tiers.map((t) => t.id);
  const tierHolders: Record<string, QuestGamer[]> = {};
  if (tierIds.length) {
    const rows = await db.select({
      tierId: schema.userQuestTiers.questTierId,
      name: schema.users.displayName, slug: schema.users.slug, avatarUrl: schema.users.avatarUrl,
    })
      .from(schema.userQuestTiers)
      .innerJoin(schema.users, eq(schema.userQuestTiers.userId, schema.users.id))
      .where(and(inArray(schema.userQuestTiers.questTierId, tierIds), eq(schema.users.status, "active")))
      .orderBy(desc(schema.userQuestTiers.awardedAt)).limit(120);
    for (const r of rows) {
      const list = tierHolders[r.tierId] ?? [];
      if (list.length < 12) { list.push({ name: r.name, slug: r.slug, avatarUrl: r.avatarUrl }); tierHolders[r.tierId] = list; }
    }
  }
  const tabs = quests.map((q) => ({ key: q.key, name: q.name, color: q.color, logoUrl: q.logoUrl, icon: q.icon, mapArtUrl: q.mapArtUrl }));
  return { quest: primary, tierHolders, tabs };
}
