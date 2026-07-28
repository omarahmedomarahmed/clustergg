import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getUserQuests } from "@/lib/quests";
import { getContent } from "@/lib/cms";
import { installUrl } from "@/lib/discord/config";
import { networkStats } from "@/lib/network";
import FloatingQuestOrb, { type OrbQuest } from "@/components/FloatingQuestOrb";
import DiscordOrb from "@/components/DiscordOrb";

// The floating rail, bottom-right.
//
// Two orbs, stacked, because they speak to two different people who are often
// in the same room: the quest orb is a signed-in gamer's progress, and the
// Discord orb is for whoever runs the server that gamer is in. Either alone
// would leave the other audience with no persistent call to action.
//
// Both sizes, colours and icons are admin-editable, and either can be turned
// off by setting its size key to 0 — a page with no orbs is a valid choice.
export default async function FloatingOrbs() {
  const [user, c] = await Promise.all([
    getCurrentUser().catch(() => null),
    getContent([
      "brand.orb.icon", "brand.orb.color", "brand.orb.size",
      "brand.discordOrb.icon", "brand.discordOrb.color", "brand.discordOrb.size",
    ]).catch(() => ({} as Record<string, string>)),
  ]);

  const clamp = (v: string | undefined, min: number, max: number, fallback: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    if (n === 0) return 0; // 0 means "hide this orb"
    return Math.max(min, Math.min(max, n));
  };

  const questSize = clamp(c["brand.orb.size"], 44, 140, 72);
  const discordSize = clamp(c["brand.discordOrb.size"], 44, 140, 72);
  const install = installUrl();

  // The quest orb needs a signed-in gamer with quests; the Discord orb needs an
  // install URL. Either can be absent without affecting the other.
  let quests: OrbQuest[] = [];
  if (user && questSize > 0) {
    try {
      const db = await getDb();
      const rows = await getUserQuests(db, user.id);
      quests = rows.map((q) => {
        const done = q.nextTier === null;
        const prev = q.currentTierIndex >= 0 ? q.tiers[q.currentTierIndex].thresholdQp : 0;
        const span = q.nextTier ? q.nextTier.thresholdQp - prev : 1;
        const into = q.nextTier ? q.qp - prev : 1;
        return {
          key: q.key, name: q.name, color: q.color, accent2: q.accent2, icon: q.icon, logoUrl: q.logoUrl,
          qp: q.qp,
          currentTierName: q.currentTierIndex >= 0 ? q.tiers[q.currentTierIndex].name : null,
          nextTierName: q.nextTier?.name ?? null,
          pct: done ? 100 : Math.max(4, Math.min(100, Math.round((into / span) * 100))),
          art: q.mapArtUrl || q.cardBgUrl || null,
        };
      });
    } catch { quests = []; }
  }

  const showDiscord = !!install && discordSize > 0;
  if (!showDiscord && quests.length === 0) return null;

  // Only worth a query if the orb that uses it is actually rendering.
  const net = showDiscord ? await networkStats().catch(() => null) : null;

  return (
    // Above the mobile bottom nav, not on top of it.
    //
    // `bottom-4` put a 72px orb directly over the tab bar on a phone, covering
    // "You" and half of "Ranks" — the two tabs a gamer uses most. The bar is
    // ~64px plus the home-indicator inset, so below `md` the rail is lifted
    // clear of it and drops back down on desktop where no bar exists.
    <div
      className="fixed right-4 z-40 flex flex-col items-end gap-3 print:hidden bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-4"
    >
      {showDiscord && (
        <DiscordOrb
          installUrl={install!}
          servers={net?.servers}
          reach={net?.reach}
          color={c["brand.discordOrb.color"] || "#5865f2"}
          size={discordSize}
          icon={c["brand.discordOrb.icon"] || undefined}
        />
      )}
      {quests.length > 0 && (
        <FloatingQuestOrb
          quests={quests}
          icon={c["brand.orb.icon"] || undefined}
          color={c["brand.orb.color"] || "#8b5cf6"}
          size={questSize}
        />
      )}
    </div>
  );
}
