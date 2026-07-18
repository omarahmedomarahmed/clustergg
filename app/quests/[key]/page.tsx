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

      {/* Per-quest CP leaderboard */}
      <div className="mx-auto max-w-3xl px-4 pb-16">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: quest.color }}>
          <Icon name="chart" size={18} /> {quest.name} leaderboard
        </h2>
        <div className="glass divide-y divide-white/5">
          {leaderboard.length === 0 && <div className="p-5 text-sm text-muted">No questers yet — be the first to earn Cluster Points here.</div>}
          {leaderboard.map((g, i) => (
            <Link key={g.slug} href={`/u/${g.slug}`} className="flex items-center gap-3 p-3 hover:bg-white/5">
              <span className="w-6 text-center font-bold text-sm" style={{ color: i < 3 ? quest.color : "#8b8ba7" }}>{i + 1}</span>
              <Avatar name={g.name} src={g.avatarUrl} size={30} />
              <span className="flex-1 truncate font-semibold text-sm">{g.name}</span>
              <span className="text-sm shrink-0" style={{ color: quest.accent2 }}>{(g.qp ?? 0).toLocaleString()} CP</span>
            </Link>
          ))}
        </div>

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
