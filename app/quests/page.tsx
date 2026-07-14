import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getUserQuests, getQuestLeaderboards } from "@/lib/quests";
import QuestCard from "@/components/QuestCard";
import OAuthButtons from "@/components/OAuthButtons";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quests" };

export default async function QuestsPage() {
  const user = await getCurrentUser();
  const db = await getDb();
  const [quests, boards] = await Promise.all([getUserQuests(db, user?.id ?? null), getQuestLeaderboards(db)]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-300 mb-2">
          <Icon name="trophy" size={14} /> Quests
        </div>
        <h1 className="text-3xl md:text-4xl font-bold">Play the Cluster. <span className="grad-text">Earn your legend.</span></h1>
        <p className="text-muted mt-2 max-w-2xl mx-auto">Every quest is a guided path across the galaxy — win challenges, grow your orbit, ascend your games, and boost your signal to unlock tier badges.</p>
      </div>

      {!user && (
        <div className="glass p-5 mb-8 max-w-md mx-auto text-center">
          <p className="text-sm text-muted mb-3">Sign in with Discord to start earning quest badges.</p>
          <div className="mx-auto max-w-xs"><OAuthButtons next="/quests" /></div>
        </div>
      )}

      {/* Your quest deck */}
      {quests.length > 0 && (
        <div className="grid md:grid-cols-2 gap-5 mb-12">
          {quests.map((q) => <QuestCard key={q.id} quest={q} />)}
        </div>
      )}

      {/* Global leaderboards */}
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Icon name="chart" size={18} className="text-cyan-300" /> Global quest leaderboard</h2>
      <div className="grid md:grid-cols-2 gap-5">
        {boards.map(({ quest, tiers, top }) => (
          <div key={quest.id} className="glass p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${quest.color}22`, border: `1px solid ${quest.color}55` }}>
                {quest.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={quest.logoUrl} alt="" className="h-6 w-6 object-contain" /> : <Icon name={quest.icon} size={18} style={{ color: quest.color }} />}
              </div>
              <h3 className="font-bold">{quest.name}</h3>
            </div>
            {/* Tier holder distribution */}
            <div className="flex flex-wrap gap-2 mb-4">
              {tiers.map((t) => (
                <div key={t.id} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-center flex-1 min-w-[64px]">
                  <div className="text-[10px] uppercase tracking-wide" style={{ color: quest.color }}>{t.name}</div>
                  <div className="text-sm font-bold">{t.holders.toLocaleString()}</div>
                </div>
              ))}
            </div>
            {/* Top questers */}
            <div className="space-y-1.5">
              {top.length === 0 && <p className="text-xs text-muted">No questers yet — be the first.</p>}
              {top.map((r, i) => (
                <Link key={r.userId} href={`/u/${r.slug}`} className="flex items-center gap-2.5 text-sm hover:text-cyan-300">
                  <span className="w-5 text-center font-bold text-xs" style={{ color: quest.color }}>{i + 1}</span>
                  <Avatar name={r.name} src={r.avatarUrl} size={24} />
                  <span className="truncate flex-1">{r.name}</span>
                  <span className="text-xs text-muted shrink-0">{r.qp.toLocaleString()} QP</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
