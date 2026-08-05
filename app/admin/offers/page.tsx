import Link from "next/link";
import { requireSystemFor } from "@/lib/departments";
import { offers } from "@/lib/offers";
import { campaignAnalytics } from "@/lib/campaigns-read";
import CampaignConsole from "@/components/CampaignConsole";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Founding offers · Admin" };

// The two promotional campaigns, switchable and counted (B30.1, amended by B44).
//
// They existed as product behaviour: counters derived from pricing config,
// always live, with no way to stop them. That is the wrong shape for spend.
// This page is the switch, the rate, and the number at the end that says what
// the spend cost and what it produced — brands and servers in ONE table,
// because "what did the founding offers cost us and what did they return" is
// one question and split across two screens it is a question nobody answers.
export default async function OffersConsolePage() {
  await requireSystemFor("/admin/offers");
  const state = await offers();
  const analytics = await campaignAnalytics(state.campaign);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <Icon name="spark" size={20} className="text-cyan-300" /> Founding offers
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Two promotional campaigns, funded out of the round rather than out of a customer&apos;s budget.
          Both are <b className="text-ink">off until you turn them on</b> — deploying this page does not start
          spending. Everything below is editable, and every bill shows the discount as its own line so the
          gross figure still says what the campaign cost.
        </p>
      </header>

      <CampaignConsole
        campaign={state.campaign}
        servers={state.servers}
        brands={state.brands}
        challengePrice={state.pricing.challengePrice}
        challengesPerBrand={state.finance.freeChallengesPerBrand}
      />

      {/* What it has cost, and what came back. */}
      <section className="glass p-5" data-campaign-analytics>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-bold">
            <Icon name="chart" size={16} className="text-amber-300" /> What the campaigns have cost
          </h2>
          <span className="text-xs text-muted">{analytics.recipients.length} recipients</span>
        </div>

        <div className="mb-4 grid gap-px overflow-hidden rounded-2xl bg-white/5 sm:grid-cols-4">
          {[
            ["Brands", `$${analytics.brandCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "text-amber-200"],
            ["Servers", `$${analytics.serverCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "text-amber-200"],
            ["Total spent", `$${analytics.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "text-rose-200"],
            ["Invoiced to those brands", `$${analytics.brandRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "text-emerald-200"],
          ].map(([label, value, cls]) => (
            <div key={label} className="bg-[#0b0f1a] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
              <div className={`mt-0.5 text-lg font-black ${cls}`} data-stat={label}>{value}</div>
            </div>
          ))}
        </div>

        {/* The brand cost is read from the discount lines ACTUALLY ISSUED, not
            from the configured percentage — the percentage is what we intend to
            spend and the lines are what we spent, and they differ the moment
            somebody edits a bill, which is allowed on purpose. */}
        <p className="mb-3 text-[11px] text-muted">
          Brand cost is summed from the discount lines actually issued, not from the percentage set above —
          so an edited invoice is counted as edited.
        </p>

        {analytics.recipients.length === 0 ? (
          <div className="rounded-xl border border-white/10 p-6 text-center text-sm text-muted">
            Nobody has received either campaign yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-wider text-muted">
                  <th className="py-2 pr-3">Who</th>
                  <th className="py-2 pr-3">Campaign</th>
                  <th className="py-2 pr-3">Received</th>
                  <th className="py-2 pr-3 text-right">Cost</th>
                  <th className="py-2 text-right">Produced</th>
                </tr>
              </thead>
              <tbody>
                {analytics.recipients.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} className="border-b border-white/5" data-recipient={r.id}>
                    <td className="py-2 pr-3">
                      {r.href
                        ? <Link href={r.href} className="font-semibold hover:text-cyan-300">{r.name}</Link>
                        : <span className="font-semibold">{r.name}</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        r.kind === "brand" ? "border-cyan-400/40 text-cyan-200" : "border-violet-400/40 text-violet-200"}`}>
                        {r.kind}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted">
                      {r.at ? new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right font-bold text-amber-200">
                      ${r.cost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 text-right">
                      <span className="font-bold text-emerald-200">
                        {r.producedLabel === "invoiced"
                          ? `$${r.produced.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                          : r.produced.toLocaleString()}
                      </span>
                      <span className="ml-1 text-[10px] text-muted">{r.producedLabel}</span>
                    </td>
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
