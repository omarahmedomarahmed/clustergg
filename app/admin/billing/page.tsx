import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { billingSummary } from "@/lib/billing";
import { brandBalances, listInvoices } from "@/lib/invoices";
import { collector } from "@/lib/payments";
import { vendorBy } from "@/lib/payments/vendors";
import { createInvoice } from "@/app/actions/billing";
import { pricingConfig } from "@/lib/pricing-live";
import { money } from "@/lib/pricing";
import InvoiceEditor from "@/components/InvoiceEditor";
import { InvoiceStatus, DueLine } from "@/components/InvoiceView";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Billing & revenue" };

// The books, on one page.
//
// Cluster's claim to a brand is that the buy is the only cost, and its claim to
// a server owner is that they get a real share of it. Both are true or not true
// here. So the page is laid out as the money moves: what came in, what we owe
// gamers, what we owe servers, and what is left — with every figure counted
// from what actually ran rather than from what was scheduled.
export default async function BillingPage({
  searchParams,
}: { searchParams: Promise<{ invoice?: string }> }) {
  await requireSystemFor("/admin/billing");
  const { invoice: openId = "" } = await searchParams;
  const cfg = await pricingConfig();
  const db = await getDb();
  const [b, invoices, balances, brandList, pay] = await Promise.all([
    billingSummary(cfg),
    listInvoices({ limit: 200 }),
    brandBalances(),
    db.select({ id: schema.brands.id, name: schema.brands.name, slug: schema.brands.slug })
      .from(schema.brands).orderBy(asc(schema.brands.name)).limit(300),
    collector(),
  ]);
  const cur = cfg.currency;
  const open = invoices.find((i) => i.id === openId) ?? null;
  const payVendor = vendorBy(pay.adapter.key);
  const outstanding = invoices
    .filter((i) => i.status === "sent")
    .reduce((a, i) => a + i.total, 0);
  const overdue = invoices.filter((i) => i.overdue).reduce((a, i) => a + i.total, 0);

  return (
    <div className="max-w-5xl">
      <div className="mb-2 flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Billing & revenue</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/payouts" className="text-cyan-300 hover:underline">Payouts →</Link>
          <Link href="/admin/payments" className="text-cyan-300 hover:underline">Providers →</Link>
          <Link href="/admin/systems/billing" className="text-cyan-300 hover:underline">What this system is for →</Link>
        </div>
      </div>
      <p className="mb-8 max-w-3xl text-sm text-muted">
        Last 90 days. <b className="text-ink">Booked</b> is what brands committed to;{" "}
        <b className="text-ink">delivered</b> is the part whose weeks actually ran. The gap between them is
        work we owe, not revenue we earned.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Booked" value={money(b.totals.booked, cur)} />
        <Stat label="Delivered" value={money(b.totals.delivered, cur)} />
        <Stat label="Owed to gamers" value={money(b.totals.toGamers, cur)} tone="amber" />
        <Stat label="Owed to servers" value={money(b.totals.toServers, cur)} tone="amber" />
        <Stat label="Cluster keeps" value={money(b.totals.kept, cur)} tone="emerald" />
      </div>

      {/* ===== Invoices =====
          The section that turns "what a brand bought" into "what a brand owes".
          Everything above this is analysis; this is the document somebody has
          to actually pay. */}
      <section className="glass mt-8 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-bold">Invoices</h2>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted">Outstanding <b className="text-amber-200 tabular-nums">{money(outstanding, cur)}</b></span>
            {overdue > 0 && <span className="text-muted">Overdue <b className="text-rose-300 tabular-nums">{money(overdue, cur)}</b></span>}
          </div>
        </div>
        <p className="mt-1 text-sm text-muted">
          A month&apos;s bill is built from the same pricing model the website quotes: the placements base,
          plus <b className="text-ink">{money(cfg.challengePrice * cfg.challengesPerGame, cur)}</b> for each
          game&apos;s {cfg.challengesPerGame} weekly challenges, minus the base reduction that buying a game
          earns. Terms run {"30"} days from the day it&apos;s issued. Every line is then yours to edit.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs">
          <span className="text-muted">Collecting through</span>
          <b>{payVendor?.name ?? pay.adapter.key}</b>
          {pay.reason
            ? <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">{pay.reason}</span>
            : <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">connected</span>}
        </div>

        <form action={async (fd: FormData) => { "use server"; await createInvoice(fd); }}
          className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
          <label className="text-[10px] uppercase tracking-widest text-muted">
            Brand
            <select name="brandId" required className="input-cosmic !py-1 mt-0.5 block w-56 text-xs">
              <option value="">Pick a brand…</option>
              {brandList.map((br) => <option key={br.id} value={br.id}>{br.name}</option>)}
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-widest text-muted">
            Terms (days)
            <input name="termsDays" type="number" min={0} max={120} defaultValue={30} className="input-cosmic !py-1 mt-0.5 block w-24 text-xs" />
          </label>
          <label className="flex items-center gap-1.5 pb-1.5 text-xs text-muted">
            <input type="checkbox" name="addon" /> Sunday Broadcast add-on
          </label>
          <button className="glow-btn pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white">Open this month&apos;s bill</button>
        </form>

        {invoices.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing invoiced yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-muted">
                <tr className="border-b border-white/10">
                  <th className="py-2 text-left">Invoice</th>
                  <th className="py-2 text-left">Brand</th>
                  <th className="py-2 text-left">Period</th>
                  <th className="py-2 text-left">Due</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className={`border-b border-white/6 last:border-0 ${i.id === openId ? "bg-cyan-500/[0.06]" : ""}`}>
                    <td className="py-2.5">
                      <Link href={`/admin/billing?invoice=${i.id}`} className="font-semibold hover:text-cyan-300">{i.number}</Link>
                    </td>
                    <td className="py-2.5 text-muted">{i.brandName}</td>
                    <td className="py-2.5 text-muted">{i.periodLabel ?? "—"}</td>
                    <td className="py-2.5 text-xs"><DueLine invoice={i} /></td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{money(i.total, i.currency)}</td>
                    <td className="py-2.5 text-right"><InvoiceStatus invoice={i} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {open && (
          <div className="mt-6 rounded-2xl border border-cyan-400/25 bg-black/30 p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-lg font-bold">
                  {open.number} <InvoiceStatus invoice={open} />
                </div>
                <div className="text-xs text-muted">
                  {open.brandName}{open.brandEmail ? ` · ${open.brandEmail}` : ""} · {open.periodLabel ?? "no period"}
                </div>
              </div>
              <Link href="/admin/billing" className="text-xs text-muted hover:text-ink">Close</Link>
            </div>
            <InvoiceEditor invoice={open} payHint={pay.reason} />
          </div>
        )}
      </section>

      {/* ===== What each brand owes ===== */}
      {balances.length > 0 && (
        <section className="glass mt-6 p-6">
          <h2 className="font-bold">Balances by brand</h2>
          <p className="mt-1 text-sm text-muted">
            Counted from invoices, not from campaigns. A campaign that ran and was never invoiced does not
            appear here — compare against the campaign bills below and the gap is revenue we forgot to ask for.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-muted">
                <tr className="border-b border-white/10">
                  <th className="py-2 text-left">Brand</th>
                  <th className="py-2 text-right">Invoices</th>
                  <th className="py-2 text-right">Billed</th>
                  <th className="py-2 text-right">Paid</th>
                  <th className="py-2 text-right">Outstanding</th>
                  <th className="py-2 text-right">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((bal) => (
                  <tr key={bal.brandId} className="border-b border-white/6 last:border-0">
                    <td className="py-2.5">{bal.brandName}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted">{bal.invoices}</td>
                    <td className="py-2.5 text-right tabular-nums">{money(bal.billed, cur)}</td>
                    <td className="py-2.5 text-right tabular-nums text-emerald-300">{money(bal.paid, cur)}</td>
                    <td className="py-2.5 text-right tabular-nums text-amber-200">{money(bal.outstanding, cur)}</td>
                    <td className={`py-2.5 text-right tabular-nums ${bal.overdue > 0 ? "text-rose-300" : "text-muted"}`}>{money(bal.overdue, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ===== Brand campaigns ===== */}
      <section className="glass mt-8 p-6">
        <h2 className="font-bold">Campaign bills</h2>
        <p className="mt-1 text-sm text-muted">
          One row per month a brand bought. A campaign with fewer delivered weeks than slots has weeks still
          to run — bill it whole, deliver it whole.
        </p>
        {b.campaigns.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing bought in this window.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-muted">
                <tr className="border-b border-white/10">
                  <th className="py-2 text-left">Brand</th>
                  <th className="py-2 text-left">Game</th>
                  <th className="py-2 text-right">Weeks</th>
                  <th className="py-2 text-right">Billed</th>
                  <th className="py-2 text-right">To gamers</th>
                  <th className="py-2 text-right">Gross fee</th>
                </tr>
              </thead>
              <tbody>
                {b.campaigns.map((c) => (
                  <tr key={c.campaignId} className="border-b border-white/6 last:border-0">
                    <td className="py-2.5">{c.brandName}</td>
                    <td className="py-2.5 text-muted">{c.game}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className={c.delivered < c.slots ? "text-amber-300" : ""}>
                        {c.delivered}
                      </span>
                      <span className="text-muted"> / {c.slots}</span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{money(c.total, cur)}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted">{money(c.prizeCommitted, cur)}</td>
                    <td className="py-2.5 text-right tabular-nums">{money(c.grossFee, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== Server monetization ===== */}
      <section className="glass mt-6 p-6">
        <h2 className="font-bold">What servers are owed</h2>
        <p className="mt-1 text-sm text-muted">
          An owner takes a share of the platform fee once their community passes the thresholds — 5% at 500
          linked gamers, 10% at 1,000, 25% at 5,000 — apportioned by how many of a challenge&apos;s entrants
          came from their server.
        </p>
        {b.servers.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No servers with linked gamers yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-muted">
                <tr className="border-b border-white/10">
                  <th className="py-2 text-left">Server</th>
                  {/* B35: both counts, always. The tier reads the qualified one;
                      the raw one is what the owner already sees. */}
                  <th className="py-2 text-right">Qualified / linked</th>
                  <th className="py-2 text-right">Their share</th>
                  <th className="py-2 text-right">Challenges</th>
                  <th className="py-2 text-right">Owed</th>
                </tr>
              </thead>
              <tbody>
                {b.servers.slice(0, 40).map((s) => (
                  <tr key={s.guildId} className="border-b border-white/6 last:border-0">
                    <td className="py-2.5">
                      <Link href={`/admin/discord/${s.guildId}`} className="hover:text-cyan-300">{s.name}</Link>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className={s.qualifiedLinked < s.linked ? "text-amber-300" : ""}>{s.qualifiedLinked.toLocaleString()}</span>
                      <span className="text-muted"> / {s.linked.toLocaleString()}</span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {s.ownerPct}% <span className="text-muted">/ {s.clusterPct}% us</span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted">{s.challenges}</td>
                    <td className={`py-2.5 text-right tabular-nums font-semibold ${s.owed > 0 ? "text-emerald-300" : "text-muted"}`}>
                      {money(s.owed, cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== Trophy distribution ===== */}
      <section className="glass mt-6 p-6">
        <h2 className="font-bold">Where the prize money went</h2>
        <p className="mt-1 text-sm text-muted">
          Per finished sponsored challenge: who won each place, which server they came to us through, and
          what it paid. A gamer&apos;s server is the one where they first linked an account — the community
          that actually brought them.
        </p>
        {b.podiums.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No sponsored challenge has finished yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {b.podiums.map((p) => (
              <div key={p.challengeId} className="rounded-xl border border-white/10 bg-black/25 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-semibold">
                    {p.title}
                    {p.brandName && <span className="ml-2 text-xs text-violet-300">{p.brandName}</span>}
                  </div>
                  <div className="text-xs text-muted tabular-nums">
                    {p.game} · ended {p.endAt.toISOString().slice(0, 10)} ·{" "}
                    {p.serversWithWinners} server{p.serversWithWinners === 1 ? "" : "s"} had a winner ·{" "}
                    {money(p.paidOut, cur)} paid
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  {p.places.map((pl) => (
                    <div key={pl.place} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-200">
                          {pl.place}
                        </span>
                        {pl.slug
                          ? <Link href={`/u/${pl.slug}`} className="hover:text-cyan-300">{pl.gamer}</Link>
                          : pl.gamer}
                        <span className="text-xs text-muted">
                          {pl.guildName ? `via ${pl.guildName}` : "no server on record"}
                        </span>
                      </span>
                      <span className="tabular-nums font-semibold text-emerald-300">{money(pl.amount, cur)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-8 flex items-start gap-2 text-xs text-muted">
        <Icon name="alert" size={12} className="mt-0.5 shrink-0 text-amber-300" />
        Discounts, refunds and waived fees are not yours to grant alone — take them to a founder first.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" | "emerald" }) {
  const cls = tone === "amber" ? "text-amber-200" : tone === "emerald" ? "text-emerald-300" : "";
  return (
    <div className="glass p-4">
      <div className={`text-xl font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
    </div>
  );
}
