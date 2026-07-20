import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getT } from "@/lib/i18n/t-server";
import { getUserQuests, getQuestTops, getCpLedger } from "@/lib/quests";
import QuestCard from "@/components/QuestCard";
import CpLedger from "@/components/CpLedger";
import CpIcon from "@/components/CpIcon";
import AdSlot from "@/components/AdSlot";
import OAuthButtons from "@/components/OAuthButtons";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quests" };

export default async function QuestsPage() {
  const user = await getCurrentUser();
  const db = await getDb();
  const quests = await getUserQuests(db, user?.id ?? null);
  const [tops, ledger] = await Promise.all([
    getQuestTops(db, quests.map((q) => q.id), 8),
    getCpLedger(db, user?.id ?? null, { limit: 200 }),
  ]);
  const totalCp = quests.reduce((s, q) => s + q.totalCp, 0);
  const { tr } = await getT(user?.locale);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-300 mb-2">
          <Icon name="trophy" size={14} /> {tr("Quests")}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold">{tr("Play the Cluster.")} <span className="grad-text">{tr("Earn your legend.")}</span></h1>
        <p className="text-muted mt-2 max-w-2xl mx-auto">{tr("Each quest is a guided path across the galaxy. Tap a quest to open its map, track your Cluster Points, and see who's leading the way.")}</p>
      </div>

      {!user && (
        <div className="glass p-5 mb-8 max-w-md mx-auto text-center">
          <p className="text-sm text-muted mb-3">{tr("Sign in with Discord to start earning quest badges.")}</p>
          <div className="mx-auto max-w-xs"><OAuthButtons next="/quests" /></div>
        </div>
      )}

      {/* Total CP + per-quest breakdown */}
      {user && quests.length > 0 && (
        <div className="glass p-5 md:p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted">{tr("Your total Cluster Points")}</div>
              <div className="flex items-center gap-2.5 mt-1">
                <CpIcon size={34} />
                <span className="text-4xl font-bold grad-text">{totalCp.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {quests.map((q) => (
                <div key={q.id} className="rounded-xl border px-3 py-2 min-w-[104px]" style={{ borderColor: `${q.color}44`, background: `${q.color}12` }}>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: q.color }}>
                    {q.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.logoUrl} alt="" className="h-4 w-4 object-contain" /> : <Icon name="spark" size={11} />}
                    {q.name}{q.completions > 0 && <span className="text-[9px] opacity-80">×{q.completions}</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-sm font-bold"><CpIcon size={13} /> {q.totalCp.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {quests.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-5">
          {quests.map((q) => <QuestCard key={q.id} quest={q} top={tops.get(q.id) ?? []} />)}
        </div>
      ) : (
        <div className="glass p-10 text-center text-muted">{tr("Quests are being forged — check back shortly.")}</div>
      )}

      {/* Full CP history log across every quest, with filters */}
      {user && ledger.length > 0 && (
        <div className="mt-8">
          <CpLedger entries={ledger} quests={quests.map((q) => ({ key: q.key, name: q.name, color: q.color }))} title={tr("Your complete CP history")} />
        </div>
      )}

      {/* Sponsor banner at the bottom of the quests page */}
      <div className="mt-10">
        <AdSlot placement="quests_footer" className="mx-auto" />
      </div>
    </div>
  );
}
