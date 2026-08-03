import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { approveRedeem, rejectRedeem, markRedeemPaid, sendRedeem } from "@/app/actions/trophies";
import { payer } from "@/lib/payments";
import { METHOD_OPTIONS } from "@/lib/payouts";
import { vendorBy } from "@/lib/payments/vendors";
import ImageUpload from "@/components/ImageUpload";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Trophy redemptions" };

const STATUS_COLOR: Record<string, string> = {
  pending: "#fbbf24", approved: "#a78bfa", sent: "#22d3ee",
  paid: "#34d399", rejected: "#fb7185", cancelled: "#94a3b8",
};

const OPEN = ["pending", "approved", "sent"];

// Winners cashing in.
//
// This page used to show staff the routing and account numbers a gamer had
// typed in, behind a "View payment details" disclosure. It doesn't, because
// they aren't collected any more — the gamer chooses where the money goes on
// the payout provider's page after we release it. What's left for staff to do
// is the part that actually needs judgement: is this request legitimate, and
// should the money go out.
export default async function AdminRedeemsPage() {
  await requireSystemFor("/admin/redeems");
  const db = await getDb();
  const { adapter, picked, reason } = await payer("rewards");
  const vendor = vendorBy(adapter.key);

  const rows = await db.select({
    r: schema.trophyRedeems,
    name: schema.users.displayName, slug: schema.users.slug,
    country: schema.users.country, changes: schema.users.payoutChanges,
    joined: schema.users.createdAt,
  }).from(schema.trophyRedeems)
    .innerJoin(schema.users, eq(schema.trophyRedeems.userId, schema.users.id))
    .orderBy(desc(schema.trophyRedeems.createdAt)).limit(100);

  const awardIds = [...new Set(rows.flatMap(({ r }) => r.awardIds ?? []))];
  const awards = awardIds.length
    ? await db.select({ id: schema.userTrophies.id, name: schema.trophies.name, value: schema.trophies.value })
        .from(schema.userTrophies).innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
        .where(inArray(schema.userTrophies.id, awardIds))
    : [];
  const awardById = new Map(awards.map((a) => [a.id, a]));
  const open = rows.filter(({ r }) => OPEN.includes(r.status));
  const closed = rows.filter(({ r }) => !OPEN.includes(r.status));
  const owed = open.reduce((s, { r }) => s + Number(r.amount), 0);
  const fmt = (d: Date | null) => d ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const methodLabel = (k: string) => METHOD_OPTIONS.find((m) => m.key === k)?.label ?? k;

  const card = ({ r, name, slug, country, changes, joined }: (typeof rows)[number]) => {
    // A request from an account that arrived last week is the one to look at
    // twice. Surfaced here rather than left for someone to remember.
    const fresh = joined && Date.now() - new Date(joined).getTime() < 7 * 86400000;
    return (
      <div key={r.id} className="glass p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/u/${slug}`} className="font-bold hover:text-cyan-300">{name} <span className="text-muted font-normal">@{slug}</span></Link>
          <span className="font-black text-emerald-300">${Number(r.amount).toLocaleString()} {r.currency}</span>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: `${STATUS_COLOR[r.status] ?? "#94a3b8"}22`, color: STATUS_COLOR[r.status] ?? "#94a3b8" }}>{r.status}</span>
          {fresh && <span className="rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase">new account</span>}
          {Number(changes) >= 3 && <span className="rounded-full bg-rose-500/15 text-rose-300 px-2 py-0.5 text-[10px] font-bold uppercase">preference locked</span>}
          <span className="text-xs text-muted ml-auto">{fmt(r.createdAt)}</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {(r.awardIds ?? []).map((id) => {
            const a = awardById.get(id);
            return <span key={id} className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5">{a ? `${a.name} · $${Number(a.value).toLocaleString()}` : "…"}</span>;
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>Prefers <b className="text-ink">{methodLabel(r.method).toLowerCase()}</b>{country ? ` · ${country}` : ""}</span>
          {r.providerRef && <span>· {r.providerKey} ref <code className="text-cyan-300">{r.providerRef}</code></span>}
          {r.sentAt && <span>· sent {fmt(r.sentAt)}</span>}
          {r.gamerConfirmedAt && <span className="text-emerald-300 inline-flex items-center gap-1"><Icon name="check" size={11} />collected {fmt(r.gamerConfirmedAt)}</span>}
        </div>

        <div className="mt-3 flex flex-wrap items-start gap-3">
          {r.status === "pending" && (
            <>
              <form action={approveRedeem.bind(null, r.id)}>
                <button className="glow-btn pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white">Approve</button>
              </form>
              <form action={rejectRedeem.bind(null, r.id)}>
                <button className="rounded-full border border-rose-400/40 text-rose-300 px-4 py-1.5 text-sm hover:bg-rose-500/10">Reject</button>
              </form>
            </>
          )}
          {r.status === "approved" && (
            <>
              <form action={async () => { "use server"; await sendRedeem(r.id); }}>
                <button className="pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white" style={{ background: "linear-gradient(90deg,#8b5cf6,#22d3ee)" }}>
                  Release {adapter.key === "manual" ? "for manual transfer" : `via ${vendor?.name ?? adapter.key}`}
                </button>
              </form>
              <form action={rejectRedeem.bind(null, r.id)}>
                <button className="rounded-full border border-rose-400/40 text-rose-300 px-4 py-1.5 text-sm hover:bg-rose-500/10">Cancel &amp; return trophies</button>
              </form>
            </>
          )}
          {r.status === "sent" && (
            <>
              {r.collectUrl && (
                <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200">
                  Collection link issued — the gamer chooses their own payout
                </span>
              )}
              <form action={markRedeemPaid.bind(null, r.id)} className="flex flex-wrap items-end gap-3">
                <ImageUpload name="proofUrl" label="Confirmation (optional)" aspect="16/9" maxDim={1400} scope="misc" previewWidth={110} />
                <button className="pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white" style={{ background: "linear-gradient(90deg,#10b981,#22d3ee)" }}>
                  Mark paid
                </button>
              </form>
            </>
          )}
          {r.status === "paid" && r.proofUrl && (
            <a href={r.proofUrl} target="_blank" rel="noreferrer" className="text-xs text-emerald-300 hover:underline inline-flex items-center gap-1">
              <Icon name="check" size={13} /> Payment confirmation
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Icon name="trophy" size={20} className="text-amber-300" /> Trophy redemptions</h1>
        <Link href="/admin/payments" className="text-sm text-cyan-300 hover:underline">Payment providers →</Link>
      </div>
      <p className="text-sm text-muted mb-4 max-w-3xl">
        Approve → release → the gamer collects. <b className="text-ink">We never hold their bank details.</b>{" "}
        Releasing hands the amount to the payout provider, which issues a link the gamer opens to choose
        exactly how they want the money — bank transfer, PayPal, a prepaid card or a gift card in their own
        currency. The trophies leave their shelf when it is collected.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm">
        <span className="text-muted">Paying through</span>
        <b>{vendor?.name ?? adapter.key}</b>
        {reason
          ? <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] text-amber-200">{reason}</span>
          : <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-200">connected</span>}
        {picked !== adapter.key && <span className="text-[11px] text-muted">(you selected {picked})</span>}
        <span className="ml-auto text-muted">Open requests: <b className="text-amber-200">${owed.toLocaleString()}</b></span>
      </div>

      {rows.length === 0 && <div className="glass p-8 text-center text-sm text-muted">No redeem requests yet.</div>}
      <div className="space-y-4">
        {open.map(card)}
        {closed.length > 0 && <div className="text-[10px] uppercase tracking-widest text-muted pt-2">History</div>}
        {closed.map(card)}
      </div>
    </div>
  );
}
