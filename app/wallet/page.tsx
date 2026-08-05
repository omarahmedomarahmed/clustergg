import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getWallet } from "@/lib/wallet";
import { getTrophyCase, getMyRedeems } from "@/lib/trophies";
import { marketplaceCatalog } from "@/lib/marketplace";
import TrophyCase from "@/components/TrophyCase";
import TrophyMarket from "@/components/TrophyMarket";
import Cp from "@/components/Cp";
import Icon from "@/components/Icon";
import FeatureShot from "@/components/FeatureShot";
import { METHOD_OPTIONS } from "@/lib/payouts";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your wallet · Cluster",
  description: "Your Cluster Points, what they are worth, the trophies you hold, and every movement in or out.",
};

const usd = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * The gamer's financial statement (B18).
 *
 * The question it exists to answer without anybody having to ask: **where did my
 * points go, and what do I have?** That spans four tables which each had their
 * own screen and never reconciled against one another.
 *
 * Two rules the layout follows:
 *
 *   - **The dollar value sits beside the points, always.** A currency whose
 *     worth is a mystery is a score, and a score is not something anybody
 *     protects or spends carefully.
 *   - **The marketplace is embedded here.** Buying is a wallet action; sending
 *     somebody elsewhere to spend the balance they are looking at is a
 *     self-inflicted drop-off.
 *
 * And one that is not about layout: **no payment detail appears on this page in
 * any state.** There is none to appear — we hold a preference word and an
 * opaque provider handle, and nothing else (docs/PAYMENTS.md).
 */
export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/wallet");
  const db = await getDb();

  const [wallet, shelf, redeems, market] = await Promise.all([
    getWallet(db, user.id),
    getTrophyCase(db, user.id),
    getMyRedeems(db, user.id),
    marketplaceCatalog(db, { userId: user.id }),
  ]);

  const held = shelf.filter((t) => t.status === "held");
  const savedMethod = (user as { payoutMethod?: { currency: string; method: string } | null }).payoutMethod ?? null;

  const TONE: Record<string, { sign: string; cls: string }> = {
    cp_in: { sign: "+", cls: "text-emerald-300" },
    cp_out: { sign: "−", cls: "text-rose-300" },
    trophy_in: { sign: "+", cls: "text-cyan-300" },
    trophy_out: { sign: "−", cls: "text-amber-300" },
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header className="glass p-6">
        <h1 className="text-2xl font-black">Your wallet</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Everything you have earned, spent and hold — and what it is worth. Every movement is below, in and out.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {/* The balance, and what it is worth. Never one without the other. */}
          <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.06] p-4">
            <div className="text-[11px] uppercase tracking-widest text-muted">To spend</div>
            <div className="mt-1 text-cyan-200"><Cp amount={wallet.balance} size="lg" /></div>
            <div className="mt-0.5 text-lg font-black text-emerald-300">{usd(wallet.balanceUsd)}</div>
            <div className="mt-1 text-[11px] text-muted">
              at <Cp amount={wallet.cpPerDollar} muted /> = $1
            </div>
          </div>
          <div className="rounded-2xl border border-white/12 p-4">
            <div className="text-[11px] uppercase tracking-widest text-muted">Trophies you hold</div>
            <div className="mt-1 text-2xl font-black">{wallet.trophiesHeld}</div>
            <div className="mt-0.5 text-lg font-black text-amber-200">{usd(wallet.trophyValue)}</div>
            <div className="mt-1 text-[11px] text-muted">redeemable for cash</div>
          </div>
          <div className="rounded-2xl border border-white/12 p-4">
            <div className="text-[11px] uppercase tracking-widest text-muted">All time</div>
            <div className="mt-1 text-sm">
              <span className="text-emerald-300 font-bold">+{wallet.earned.toLocaleString()}</span>{" "}
              <span className="text-muted">earned</span>
            </div>
            <div className="text-sm">
              <span className="text-rose-300 font-bold">−{wallet.spent.toLocaleString()}</span>{" "}
              <span className="text-muted">spent</span>
            </div>
            <Link href="/quests" className="mt-2 inline-block text-[11px] text-cyan-300 hover:underline">
              Earn more <Icon name="chevronRight" size={10} className="inline" />
            </Link>
          </div>
        </div>
      </header>

      <FeatureShot shotKey="gamer.wallet" />

      {/* The trophy case, with a redeem action on each. */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Icon name="trophy" size={18} className="text-amber-300" /> Your trophies
          </h2>
          {/* The full flow (B6). The popup on the card is still there for one
              trophy; this is the route for the moment somebody cashes out $400,
              and it is the one that can be linked to, refreshed and resumed. */}
          {wallet.trophiesHeld > 0 && (
            <Link href="/redeem"
              className="rounded-full bg-emerald-500/25 px-4 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-500/35">
              Cash out ${wallet.trophyValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              <Icon name="chevronRight" size={11} className="ml-1 inline" />
            </Link>
          )}
        </div>
        <TrophyCase awards={shelf} redeems={redeems} savedMethod={savedMethod} changesUsed={0} variant="card" />
      </section>

      {/* The ledger. */}
      <section>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
          <Icon name="clock" size={18} className="text-cyan-300" /> Every movement
        </h2>
        <p className="mb-3 text-xs text-muted">
          Points in and out, trophies in and out. A trophy arriving is not a points movement, so the two columns
          are kept apart — the points column is the one that adds up to your balance.
        </p>
        {wallet.ledger.length === 0 ? (
          <div className="glass p-8 text-center text-sm text-muted">
            Nothing has moved yet. <Link href="/quests" className="text-cyan-300 underline">Start earning</Link>.
          </div>
        ) : (
          <div className="glass divide-y divide-white/5">
            {wallet.ledger.map((r) => {
              const t = TONE[r.kind];
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  {r.imageUrl
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={r.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
                    : <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 ${t.cls}`}>
                        <Icon name={r.kind.startsWith("cp") ? "spark" : "trophy"} size={15} />
                      </span>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{r.label}</div>
                    <div className="text-[11px] text-muted">
                      {r.detail ? `${r.detail} · ` : ""}{when(r.at)}
                    </div>
                  </div>
                  <div className={`shrink-0 text-right text-sm font-bold ${t.cls}`}>
                    {r.cp !== 0 && <div>{r.cp > 0 ? "+" : "−"}<Cp amount={Math.abs(r.cp)} /></div>}
                    {r.usd !== 0 && <div>{t.sign}{usd(r.usd)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <FeatureShot shotKey="gamer.wallet.ledger" />

      {/* Buying is a wallet action. */}
      <section>
        <TrophyMarket
          trophies={market.trophies} wallet={market.wallet} signedIn
          heading="Spend it"
        />
      </section>

      <p className="text-center text-[11px] text-muted">
        We never hold your bank, card or wallet details — you choose where money lands on our payout partner&rsquo;s
        own page. <Link href="/legal/economy" className="underline">Economy &amp; payout terms</Link>.
      </p>
      <span className="sr-only">{METHOD_OPTIONS.length} payout preferences supported</span>
    </div>
  );
}
