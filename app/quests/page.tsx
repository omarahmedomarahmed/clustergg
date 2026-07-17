import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getUserQuests, getQuestTops } from "@/lib/quests";
import QuestCard from "@/components/QuestCard";
import OAuthButtons from "@/components/OAuthButtons";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quests" };

export default async function QuestsPage() {
  const user = await getCurrentUser();
  const db = await getDb();
  const quests = await getUserQuests(db, user?.id ?? null);
  const tops = await getQuestTops(db, quests.map((q) => q.id), 8);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-300 mb-2">
          <Icon name="trophy" size={14} /> Quests
        </div>
        <h1 className="text-3xl md:text-4xl font-bold">Play the Cluster. <span className="grad-text">Earn your legend.</span></h1>
        <p className="text-muted mt-2 max-w-2xl mx-auto">Each quest is a guided path across the galaxy. Tap a quest to open its map, track your Cluster Points, and see who&apos;s leading the way.</p>
      </div>

      {!user && (
        <div className="glass p-5 mb-8 max-w-md mx-auto text-center">
          <p className="text-sm text-muted mb-3">Sign in with Discord to start earning quest badges.</p>
          <div className="mx-auto max-w-xs"><OAuthButtons next="/quests" /></div>
        </div>
      )}

      {quests.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-5">
          {quests.map((q) => <QuestCard key={q.id} quest={q} top={tops.get(q.id) ?? []} />)}
        </div>
      ) : (
        <div className="glass p-10 text-center text-muted">Quests are being forged — check back shortly.</div>
      )}
    </div>
  );
}
