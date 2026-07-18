import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getUserQuests } from "@/lib/quests";
import { getContent } from "@/lib/cms";
import FloatingQuestOrb, { type OrbQuest } from "@/components/FloatingQuestOrb";

// Server wrapper: loads the signed-in gamer's quest progress and renders the
// global floating orb. Renders nothing for guests.
export default async function QuestOrbMount() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return null;
  let quests;
  let orbIcon = "";
  try {
    const db = await getDb();
    quests = await getUserQuests(db, user.id);
    orbIcon = (await getContent(["brand.orb.icon"]))["brand.orb.icon"] || "";
  } catch { return null; }

  const orb: OrbQuest[] = quests.map((q) => {
    const done = q.nextTier === null;
    const prev = q.currentTierIndex >= 0 ? q.tiers[q.currentTierIndex].thresholdQp : 0;
    const span = q.nextTier ? q.nextTier.thresholdQp - prev : 1;
    const into = q.nextTier ? q.qp - prev : 1;
    const pct = done ? 100 : Math.max(4, Math.min(100, Math.round((into / span) * 100)));
    return {
      key: q.key, name: q.name, color: q.color, accent2: q.accent2, icon: q.icon, logoUrl: q.logoUrl,
      qp: q.qp, currentTierName: q.currentTierIndex >= 0 ? q.tiers[q.currentTierIndex].name : null,
      nextTierName: q.nextTier?.name ?? null, pct, art: q.mapArtUrl || q.cardBgUrl || null,
    };
  });

  return <FloatingQuestOrb quests={orb} icon={orbIcon || undefined} />;
}
