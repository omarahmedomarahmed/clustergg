import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { billingSummary } from "@/lib/billing";
import { pricingConfig } from "@/lib/pricing-live";
import { money } from "@/lib/pricing";
import { listPayouts, OPEN_STATUSES } from "@/lib/payouts";
import { payer } from "@/lib/payments";
import { vendorBy } from "@/lib/payments/vendors";
import PayoutQueue, { OpenButton } from "@/components/PayoutQueue";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Payouts" };

// Money out to server owners.
//
// The page is deliberately two halves. On the left, what every server has
// EARNED and not been paid — computed from the challenge ledger, never typed.
// On the right, what has actually been sent. The gap between them is the only
// number that matters here, and an owner chasing us about it should find that
// we already knew.
//
// Members' winnings are not on this page at all. They are paid to the gamers
// who won them, through the trophy redemption queue, and mixing the two would
// eventually put a gamer's prize into an owner's bank account.
export default async function AdminPayoutsPage() {
  await requireSystemFor("/admin/payouts");
  const db = await getDb();
  const cfg = await pricingConfig();
  const [b, payouts, guilds, pay] = await Promise.all([
    billingSummary(cfg),
    listPayouts({ limit: 200 }),
    db.select({
      guildId: schema.discordGuilds.guildId,
      name: schema.discordGuilds.name,
      slug: schema.discordGuilds.slug,
    }).from(schema.discordGuilds).where(eq(schema.discordGuilds.status, "active")).limit(400),
    payer("payout"),
  ]);
  const vendor = vendorBy(pay.adapter.key);

  // Payout accounts, so staff can see who is actually payable before releasing.
  const accounts = guilds.length
    ? await db.select().from(schema.payoutAccounts)
        .where(inArray(schema.payoutAccounts.ownerId, guilds.map((g) => g.guildId)))
    : [];
  const accountBy = new Map(accounts.filter((a) => a.ownerType === "server").map((a) => [a.ownerId, a]));

  // What each server has been paid, and what is moving.
  const settled = new Map<string, { paid: number; open: number }>();
  for (const p of payouts) {
    const cur = settled.get(p.guildId) ?? { paid: 0, open: 0 };
    if (p.status === "paid") cur.paid += p.total;
    else if (OPEN_STATUSES.includes(p.status)) cur.open += p.total;
    settled.set(p.guildId, cur);
  }

  const owing = b.servers
    .map((s) => {
      const st = settled.get(s.guildId) ?? { paid: 0, open: 0 };
      return { ...s, ...st, unpaid: Math.round((s.owed - st.paid - st.open) * 100) / 100 };
    })
    .sort((a, c) => c.unpaid - a.unpaid);

  const totalUnpaid = owing.reduce((a, s) => a + Math.max(0, s.unpaid), 0);
  const totalOpen = payouts.filter((p) => OPEN_STATUSES.includes(p.status)).reduce((a, p) => a + p.total, 0);
  const totalPaid = payouts.filter((p) => p.status === "paid").reduce((a, p) => a + p.total, 0);
  const recentPayouts = [...payouts].sort((x, y) => +y.createdAt - +x.createdAt).slice(0, 60);

  return (
    <div className="max-w-5xl">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Payouts</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/redeems" className="text-cyan-300 hover:underline">Trophy redemptions →</Link>
          <Link href="/admin/billing" className="text-cyan-300 hover:underline">Billing →</Link>
          <Link href="/admin/payments" className="text-cyan-300 hover:underline">Providers →</Link>
        </div>
      </div>
      <p className="mb-6 max-w-3xl text-sm text-muted">
        What server owners have earned out of the platform fee, and what has been sent. Amounts are computed
        from the challenge ledger — nobody types them. <b className="text-ink">Prize money is not here</b>: it
        belongs to the gamers who won it and goes out through trophy redemptions.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm">
        <span className="text-muted">Paying through</span>
        <b>{vendor?.name ?? pay.adapter.key}</b>
        {pay.reason
          ? <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] text-amber-200">{pay.reason}</span>
          : <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-200">connected</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Owed, not yet opened" value={money(totalUnpaid, cfg.currency)} tone="amber" />
        <Stat label="Open payouts" value={money(totalOpen, cfg.currency)} />
        <Stat label="Paid all time" value={money(totalPaid, cfg.currency)} tone="emerald" />
        <Stat label="Servers earning" value={String(owing.filter((s) => s.owed > 0).length)} />
      </div>

      {/* ===== What each server is owed ===== */}
      <section className="glass mt-8 p-6">
        <h2 className="font-bold">Earned and unpaid</h2>
        <p className="mt-1 text-sm text-muted">
          Opening a payout gathers every finished sponsored challenge this server earned on, nets off what has
          already gone out, and files it for release. It does not send anything — that&apos;s the next step,
          on purpose.
        </p>
        {owing.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No server has earned anything yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-muted">
                <tr className="border-b border-white/10">
                  <th className="py-2 text-left">Server</th>
                  <th className="py-2 text-right">Linked</th>
                  <th className="py-2 text-right">Share</th>
                  <th className="py-2 text-right">Earned</th>
                  <th className="py-2 text-right">Paid</th>
                  <th className="py-2 text-right">Unpaid</th>
                  <th className="py-2 text-left">Payout account</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {owing.map((s) => {
                  const acct = accountBy.get(s.guildId);
                  return (
                    <tr key={s.guildId} className="border-b border-white/6 last:border-0">
                      <td className="py-2.5">
                        <Link href={`/admin/discord/${s.guildId}`} className="hover:text-cyan-300">{s.name}</Link>
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted">{s.linked.toLocaleString()}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted">{s.ownerPct}%</td>
                      <td className="py-2.5 text-right tabular-nums">{money(s.owed, cfg.currency)}</td>
                      <td className="py-2.5 text-right tabular-nums text-emerald-300">{money(s.paid, cfg.currency)}</td>
                      <td className={`py-2.5 text-right font-semibold tabular-nums ${s.unpaid > 0 ? "text-amber-200" : "text-muted"}`}>
                        {money(Math.max(0, s.unpaid), cfg.currency)}
                      </td>
                      <td className="py-2.5 text-xs">
                        {acct?.methodPreference
                          ? <span className={acct.status === "ready" ? "text-emerald-300" : "text-amber-200"}>{acct.methodPreference}{acct.country ? ` · ${acct.country}` : ""}</span>
                          : <span className="text-muted">not set up</span>}
                      </td>
                      <td className="py-2.5 text-right">
                        <OpenButton guildId={s.guildId} disabled={s.unpaid <= 0} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== The queue ===== */}
      <section className="glass mt-6 p-6">
        <h2 className="font-bold">Payout queue</h2>
        <p className="mt-1 text-sm text-muted">
          Review the lines, then release. Every release is attributed to whoever pressed it and written to the
          audit log — &quot;who authorised this payment&quot; should never be a question this platform
          can&apos;t answer.
        </p>
        <PayoutQueue
          payouts={recentPayouts.map((p) => ({
            id: p.id, guildId: p.guildId, guildName: p.guildName, status: p.status,
            total: p.total, currency: p.currency,
            createdAt: p.createdAt.toISOString(), paidAt: p.paidAt?.toISOString() ?? null,
            providerKey: p.providerKey, providerRef: p.providerRef, collectUrl: p.collectUrl,
            failedReason: p.failedReason, note: p.note,
            lines: p.lines.map((l) => ({ id: l.id, label: l.label, amount: l.amount, kind: l.kind })),
          }))}
          guilds={guilds.map((g) => ({ guildId: g.guildId, name: g.name || g.guildId }))}
          providerLabel={vendor?.name ?? pay.adapter.key}
          manual={pay.adapter.key === "manual"}
        />
      </section>

      <p className="mt-8 flex items-start gap-2 text-xs text-muted">
        <Icon name="alert" size={12} className="mt-0.5 shrink-0 text-amber-300" />
        A server owner disputing what they earned goes to a founder, not into a manual adjustment.
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

void desc;
