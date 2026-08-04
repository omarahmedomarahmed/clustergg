import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { anomalousGrowth, linkedCounts, payoutHoldFor, PAYOUT_HOLD_DAYS, QUALIFY_RULE } from "@/lib/abuse";
import Icon from "@/components/Icon";
import FeatureShot from "@/components/FeatureShot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Growth review" };

/**
 * Growth we look at before we pay for it (B35).
 *
 * **This page blocks nothing.** Every signal on it has an innocent explanation —
 * a server really can go viral, and a new game really does arrive with a wave of
 * accounts nobody has proven yet. The thing that actually stops money leaving is
 * the holding period on the payout; this is the queue that gives a human
 * something to look at before that period runs out.
 *
 * Treating detection as enforcement is how an honest server gets frozen for
 * growing, which is the one outcome worse than paying a fraud once.
 */
export default async function GrowthReviewPage() {
  await requireSystemFor("/admin/growth-review");
  const db = await getDb();

  const flags = await anomalousGrowth(db);
  const holds = await Promise.all(flags.map((f) => payoutHoldFor(db, f.guildId)));
  const all = await linkedCounts(db);
  const totalRaw = [...all.values()].reduce((s, c) => s + c.raw, 0);
  const totalQual = [...all.values()].reduce((s, c) => s + c.qualified, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Growth review</h1>
      <p className="text-sm text-muted mb-6 max-w-3xl">
        Servers whose linked-member growth is worth a look before a payout goes out. Nothing here is blocked by
        being listed — the holding period is what stops the money, and this is what gives you time to use it.
      </p>

      <FeatureShot shotKey="admin.abuse.review" className="mb-6" />

      <div className="glass mb-6 flex flex-wrap items-center gap-6 p-5 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted">Qualified across the network</div>
          <div className="text-2xl font-black tabular-nums">
            {totalQual.toLocaleString()}
            <span className="text-base font-normal text-muted"> of {totalRaw.toLocaleString()}</span>
          </div>
        </div>
        <div className="max-w-lg text-xs text-muted">
          <b className="text-ink">The rule:</b> {QUALIFY_RULE}
        </div>
        <div className="ml-auto text-xs text-muted">
          First payouts hold for <b className="text-ink">{PAYOUT_HOLD_DAYS} days</b> after a tier unlocks.
        </div>
      </div>

      {flags.length === 0 ? (
        <div className="glass p-8 text-center text-sm text-muted">
          Nothing to look at. Servers appear here when most of their linked members do not qualify, or when a large
          share of them arrived in one week.
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map((f, i) => {
            const hold = holds[i];
            return (
              <div key={f.guildId} className="glass p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Icon name="alert" size={16} className="shrink-0 text-amber-300" />
                  <Link href={`/admin/discord/${f.guildId}`} className="font-bold hover:text-cyan-300">{f.name}</Link>
                  <span className="text-xs text-muted">
                    <b className="text-amber-300">{f.qualified.toLocaleString()}</b> qualified of{" "}
                    {f.raw.toLocaleString()} linked · {f.recent.toLocaleString()} in the last week
                  </span>
                  <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    hold.held ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
                    {hold.held ? "payout held" : "payout releasable"}
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {f.reasons.map((r, j) => (
                    <li key={j} className="text-xs text-muted">— {r}</li>
                  ))}
                </ul>
                {/* The consequential line: a flagged server whose hold has
                    already expired is the one that needs a decision today. */}
                {!hold.held && (
                  <p className="mt-2 rounded-xl border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-200">
                    This server&rsquo;s holding period has passed, so a payout can be released. Decide before it is.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
