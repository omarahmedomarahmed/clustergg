import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getQuestByKey, getTotalCp, getCpLedger } from "@/lib/quests";
import { getContent } from "@/lib/cms";
import QuestMapHero from "@/components/QuestMapHero";
import CpLedger from "@/components/CpLedger";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: `Quest · ${key}` };
}

export default async function QuestDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const user = await getCurrentUser();
  const db = await getDb();
  const detail = await getQuestByKey(db, key, user?.id ?? null);
  if (!detail) notFound();

  const { quest, allQuests, tierHolders, leaderboard } = detail;
  const [totalCp, questLedger, brand] = await Promise.all([
    getTotalCp(db, user?.id ?? null),
    getCpLedger(db, user?.id ?? null, { questId: quest.id, limit: 120 }),
    getContent(["brand.quest.rocket"]),
  ]);
  const rocketUrl = brand["brand.quest.rocket"] || undefined;
  const tabs = allQuests.map((q) => ({ key: q.key, name: q.name, color: q.color, logoUrl: q.logoUrl, icon: q.icon, mapArtUrl: q.mapArtUrl }));

  return (
    <div>
      <QuestMapHero quest={quest} tierHolders={tierHolders} tabs={tabs} backHref="/quests" totalCp={totalCp} rocketUrl={rocketUrl} />

      {/* Glorified milestone leaderboard */}
      <div className="mx-auto max-w-3xl px-4 pb-16">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: quest.color }}>
            <Icon name="trophy" size={18} /> {quest.name} milestone leaderboard
          </h2>
          <span className="text-xs text-muted">{leaderboard.length} quester{leaderboard.length === 1 ? "" : "s"}</span>
        </div>

        {leaderboard.length === 0 ? (
          <div className="glass p-6 text-center text-sm text-muted">No questers yet — be the first to earn Cluster Points here.</div>
        ) : (() => {
          const tierFor = (qp: number) => [...quest.tiers].filter((t) => qp >= t.thresholdQp).sort((a, b) => b.thresholdQp - a.thresholdQp)[0] ?? null;
          const medal = ["#fbbf24", "#cbd5e1", "#b45309"];
          const podium = leaderboard.slice(0, 3);
          const order = podium.length === 3 ? [1, 0, 2] : podium.map((_, i) => i);
          return (
            <>
              {/* Podium — who's reached the furthest milestones */}
              <div className={`grid gap-3 mb-4 ${podium.length >= 3 ? "grid-cols-3" : podium.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                {order.map((pos) => {
                  const g = podium[pos]; if (!g) return null;
                  const t = tierFor(g.qp ?? 0);
                  const raised = pos === 0;
                  return (
                    <Link key={g.slug} href={`/u/${g.slug}`}
                      className={`glass relative flex flex-col items-center text-center p-4 hover:ring-1 hover:ring-cyan-400/40 transition ${raised ? "sm:-mt-3" : "sm:mt-2"}`}
                      style={{ borderTop: `3px solid ${medal[pos]}` }}>
                      <span className="absolute top-2 left-2 text-xs font-black" style={{ color: medal[pos] }}>#{pos + 1}</span>
                      <div className="relative">
                        <Avatar name={g.name} src={g.avatarUrl} size={raised ? 64 : 52} />
                        {t?.iconUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.iconUrl} alt="" className="absolute -bottom-1 -right-1 h-7 w-7 object-contain drop-shadow" />}
                      </div>
                      <div className="mt-2 font-bold text-sm truncate max-w-full">{g.name}</div>
                      {t && <div className="text-[11px] font-semibold" style={{ color: t.color || quest.color }}>{t.name}</div>}
                      <div className="mt-0.5 inline-flex items-center gap-1 text-sm font-bold" style={{ color: quest.accent2 }}>{(g.qp ?? 0).toLocaleString()} CP</div>
                    </Link>
                  );
                })}
              </div>

              {/* The rest */}
              {leaderboard.length > 3 && (
                <div className="glass divide-y divide-white/5">
                  {leaderboard.slice(3).map((g, i) => {
                    const t = tierFor(g.qp ?? 0);
                    const mine = user?.slug === g.slug;
                    return (
                      <Link key={g.slug} href={`/u/${g.slug}`} className={`flex items-center gap-3 p-3 ${mine ? "bg-cyan-500/[0.08]" : "hover:bg-white/5"}`}>
                        <span className="w-6 text-center font-bold text-sm text-muted">{i + 4}</span>
                        <Avatar name={g.name} src={g.avatarUrl} size={34} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-sm">{g.name}{mine && <span className="text-cyan-300"> · you</span>}</span>
                          {t && <span className="block text-[11px]" style={{ color: t.color || quest.color }}>Reached {t.name}</span>}
                        </span>
                        <span className="text-sm shrink-0 font-bold" style={{ color: quest.accent2 }}>{(g.qp ?? 0).toLocaleString()} CP</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}

        {/* This quest's CP history */}
        {questLedger.length > 0 && (
          <div className="mt-6">
            <CpLedger entries={questLedger} title={`${quest.name} CP history`} />
          </div>
        )}
      </div>
    </div>
  );
}
