import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { marketplaceCatalog } from "@/lib/marketplace";
import TrophyMarket from "@/components/TrophyMarket";
import AdSlot from "@/components/AdSlot";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Trophy marketplace · Cluster",
  description:
    "Spend the Cluster Points you earn playing on real trophies — keep them on your profile or redeem them for cash. Buy one for yourself or gift it to another gamer.",
};

export default async function MarketplacePage() {
  const db = await getDb();
  const session = await getSession();
  const { trophies, wallet, rate } = await marketplaceCatalog(db, { userId: session?.uid ?? null });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      <header className="glass overflow-hidden p-6">
        <h1 className="text-2xl font-black">What your points are for</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Cluster Points are earned free, just by playing — every quest action pays, whether or not you win
          the challenge. Here is where they turn into something real: a trophy on your profile that can be
          redeemed for cash, or a gift to another gamer.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <span className="rounded-full border border-white/12 px-3 py-1.5">
            <Icon name="spark" size={12} className="mr-1 inline text-amber-300" />
            {rate.toLocaleString()} CP = $1 of trophy
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
    </div>
  );
}
