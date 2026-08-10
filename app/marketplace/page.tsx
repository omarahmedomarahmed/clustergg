import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { marketplaceCatalog } from "@/lib/marketplace";
import { getUserQuests, getQuestTops } from "@/lib/quests";
import QuestCard from "@/components/QuestCard";
import Link from "next/link";
import TrophyMarket from "@/components/TrophyMarket";
import AdSlot from "@/components/AdSlot";
import Icon from "@/components/Icon";
import Cp from "@/components/Cp";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Trophy marketplace · Cluster",
  description:
    "Spend the Cluster Points you earn playing on real trophies — keep them on your profile or redeem them for cash from 18.",
};

export default async function MarketplacePage() {
  const db = await getDb();
  const session = await getSession();
  const { trophies, wallet, rate } = await marketplaceCatalog(db, { userId: session?.uid ?? null });
  // B48: the quests come to the shelf.
  //
  // B34 priced a $5 trophy at 50,000 CP — a hundred days at the ceiling, which
  // is the intended economy. But it makes this a shelf a new gamer cannot reach,
  // and a price with no visible path to affording it does not read as
  // aspiration, it reads as a wall. The answer to "how do I get there?" belongs
  // on the page that asked the question.
  const quests = await getUserQuests(db, session?.uid ?? null);
  const tops = await getQuestTops(db, quests.map((q) => q.id), 3);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      <header className="glass overflow-hidden p-6">
        <h1 className="text-2xl font-black">What your points are for</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Cluster Points are earned free, just by playing — every quest action pays, whether or not you win
          the challenge. Here is where they turn into something real: a trophy on your profile, and a
          trophy is the one thing here that converts into money.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <span className="rounded-full border border-white/12 px-3 py-1.5">
            <Icon name="spark" size={12} className="mr-1 inline text-amber-300" />
            <Cp amount={rate} /> = $1 of trophy
          </span>
          <span className="rounded-full border border-white/12 px-3 py-1.5">
            <Icon name="check" size={12} className="mr-1 inline text-emerald-300" />
            Spending never lowers your level
          </span>
          <span className="rounded-full border border-white/12 px-3 py-1.5">
            <Icon name="trophy" size={12} className="mr-1 inline text-cyan-300" />
            A bought trophy redeems like a won one
          </span>
        </div>
      </header>

      <AdSlot placement="marketplace_top" />

      <TrophyMarket trophies={trophies} wallet={wallet} signedIn={!!session?.uid} />

      {/* How you get the points, under the things they buy. */}
      {quests.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Icon name="spark" size={18} className="text-violet-300" /> How you earn them
              </h2>
              <p className="mt-0.5 max-w-2xl text-xs text-muted">
                Every quest pays Cluster Points for things you were doing anyway. Nothing here costs money, and
                every action states its daily cap before you start.
              </p>
            </div>
            <Link href="/quests" className="ghost-btn rounded-full px-4 py-2 text-xs font-semibold">
              Open your quests <Icon name="chevronRight" size={12} className="ml-1 inline" />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {quests.map((q) => (
              <QuestCard key={q.id} quest={q} top={tops.get(q.id) ?? []} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
