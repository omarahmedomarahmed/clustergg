import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { marketplaceCatalog, marketplaceOrders, marketplaceWallet, DEFAULT_CP_PER_DOLLAR, TIER_MULTIPLIER } from "@/lib/marketplace";
import { timeAgo } from "@/lib/utils";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Marketplace" };

const num = (n: number) => n.toLocaleString();

export default async function AdminMarketplacePage() {
  await requireSystemFor("/admin/marketplace");
  const db = await getDb();
  const [{ trophies, rate }, orders, wallet] = await Promise.all([
    marketplaceCatalog(db, { includeHidden: true }),
    marketplaceOrders(db),
    marketplaceWallet(db),
  ]);

  const onSale = trophies.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Marketplace</h1>
        <p className="mt-1 text-sm text-muted">
          What Cluster Points are for. Every trophy on the platform can be bought with the points gamers
          earn free, which is what makes losing a challenge still worth playing.
        </p>
      </div>

      {/* The wallet: what the economy has actually done.
          `liability` is the number nobody thinks to compute — every trophy sold
          is redeemable, so CP taken in is matched by a real dollar obligation. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="CP taken in" value={num(wallet.cpTaken)} accent="#22d3ee" />
        <Stat label="Trophies sold" value={num(wallet.orders)} />
        <Stat label="Sent as gifts" value={num(wallet.gifts)} />
        <Stat label="Buyers" value={num(wallet.buyers)} />
        <Stat label="Redeemable liability" value={`$${num(Math.round(wallet.liability))}`} accent="#fbbf24" />
      </div>

      <div className="glass p-4">
        <h2 className="mb-2 text-sm font-bold">How the price is worked out</h2>
        <p className="text-xs text-muted">
          <b className="text-ink">{num(rate)} CP = $1</b> of trophy value
          {rate === DEFAULT_CP_PER_DOLLAR && <> (the default)</>}, multiplied by tier:{" "}
          {Object.entries(TIER_MULTIPLIER).map(([t, m]) => `${t} ×${m}`).join(" · ")}, rounded up to a clean
          hundred with a floor of 500 CP. A price typed into a trophy on the{" "}
          <Link href="/admin/trophies" className="text-cyan-300 underline">Trophies</Link> page overrides all
          of that. Set the rate with the platform setting <code className="text-muted">marketplace.cpPerDollar</code>.
        </p>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-bold">
          <Icon name="trophy" size={16} className="text-amber-300" /> The shelf
          <span className="text-xs font-normal text-muted">({onSale} trophies · edit prices on the Trophies page)</span>
        </h2>
        <div className="glass overflow-x-auto">
          <table className="table-cosmic w-full min-w-[720px]">
            <thead>
              <tr><th>Trophy</th><th>Tier</th><th>Cash value</th><th>CP price</th><th>Priced</th><th>On sale</th></tr>
            </thead>
            <tbody>
              {trophies.map((t) => (
                <tr key={t.id}>
                  <td className="flex items-center gap-2 text-sm font-semibold">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.imageUrl} alt="" className="h-8 w-8 rounded object-contain" />
                    {t.name}
                    {t.brandName && <span className="text-[10px] text-cyan-300">{t.brandName}</span>}
                  </td>
                  <td className="text-xs uppercase tracking-wider text-muted">{t.tier}</td>
                  <td className="text-sm">${num(t.value)}</td>
                  <td className="text-sm font-bold text-cyan-200">{num(t.cpPrice)}</td>
                  <td className="text-xs text-muted">{t.pricedByHand ? "by hand" : "by the model"}</td>
                  <td className="text-xs text-emerald-300">on the shelf</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-bold">
          <Icon name="chart" size={16} className="text-cyan-300" /> Every transaction
          <span className="text-xs font-normal text-muted">({orders.length})</span>
        </h2>
        {orders.length === 0 ? (
          <div className="glass p-6 text-center text-sm text-muted">Nothing bought yet.</div>
        ) : (
          <div className="glass overflow-x-auto">
            <table className="table-cosmic w-full min-w-[720px]">
              <thead>
                <tr><th>When</th><th>Trophy</th><th>Buyer</th><th>Goes to</th><th>CP</th><th>Value</th></tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="text-xs text-muted">{timeAgo(new Date(o.at))}</td>
                    <td className="text-sm font-semibold">{o.trophyName}</td>
                    <td className="text-sm"><Link href={`/u/${o.buyerSlug}`} className="hover:text-cyan-300">{o.buyerName}</Link></td>
                    <td className="text-sm">
                      {o.kind === "gift"
                        ? <><Icon name="spark" size={11} className="mr-1 inline text-violet-300" /><Link href={`/u/${o.recipientSlug}`} className="hover:text-cyan-300">{o.recipientName}</Link></>
                        : <span className="text-muted">themselves</span>}
                    </td>
                    <td className="text-sm font-bold text-cyan-200">{num(o.cpSpent)}</td>
                    <td className="text-sm">${num(o.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="glass p-4">
      <div className="text-xl font-black" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}
