import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { approveRedeem, rejectRedeem, markRedeemPaid } from "@/app/actions/trophies";
import { payoutLast4 } from "@/lib/trophies";
import ImageUpload from "@/components/ImageUpload";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Trophy redemptions" };

const STATUS_COLOR: Record<string, string> = {
  pending: "#fbbf24", approved: "#22d3ee", paid: "#34d399", rejected: "#fb7185", cancelled: "#94a3b8",
};

export default async function AdminRedeemsPage() {
  const db = await getDb();
  const rows = await db.select({
    r: schema.trophyRedeems,
    name: schema.users.displayName, slug: schema.users.slug, changes: schema.users.payoutChanges,
  }).from(schema.trophyRedeems)
    .innerJoin(schema.users, eq(schema.trophyRedeems.userId, schema.users.id))
    .orderBy(desc(schema.trophyRedeems.createdAt)).limit(100);

  // Trophy names per request (for the award list).
  const awardIds = [...new Set(rows.flatMap(({ r }) => r.awardIds ?? []))];
  const awards = awardIds.length
    ? await db.select({ id: schema.userTrophies.id, name: schema.trophies.name, value: schema.trophies.value })
        .from(schema.userTrophies).innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
        .where(inArray(schema.userTrophies.id, awardIds))
    : [];
  const awardById = new Map(awards.map((a) => [a.id, a]));
  const open = rows.filter(({ r }) => r.status === "pending" || r.status === "approved");
  const closed = rows.filter(({ r }) => r.status !== "pending" && r.status !== "approved");
  const fmt = (d: Date | null) => d ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  const card = ({ r, name, slug, changes }: (typeof rows)[number]) => (
    <div key={r.id} className="glass p-5">
      <div className="flex flex-wrap items-center gap-3">
        <a href={`/u/${slug}`} className="font-bold hover:text-cyan-300">{name} <span className="text-muted font-normal">@{slug}</span></a>
        <span className="font-black text-emerald-300">${Number(r.amount).toLocaleString()} {r.currency}</span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ background: `${STATUS_COLOR[r.status] ?? "#94a3b8"}22`, color: STATUS_COLOR[r.status] ?? "#94a3b8" }}>{r.status}</span>
        {Number(changes) >= 3 && <span className="rounded-full bg-rose-500/15 text-rose-300 px-2 py-0.5 text-[10px] font-bold uppercase">method locked (3 changes)</span>}
        <span className="text-xs text-muted ml-auto">{fmt(r.createdAt)}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {(r.awardIds ?? []).map((id) => {
          const a = awardById.get(id);
          return <span key={id} className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5">{a ? `${a.name} · $${Number(a.value).toLocaleString()}` : "…"}</span>;
        })}
      </div>

      <div className="mt-2 text-xs text-muted">
        {r.method === "ach" ? "ACH transfer" : r.method === "wallet" ? "Mobile Wallet" : "InstaPay"} ···{payoutLast4(r.details)}
        {r.gamerConfirmedAt && <span className="text-emerald-300 ml-2">✓ gamer confirmed {fmt(r.gamerConfirmedAt)}</span>}
      </div>

      {/* Full payout details on demand — reviewing before paying */}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-cyan-300 hover:underline">View payment details</summary>
        <div className="mt-1.5 rounded-lg border border-white/10 bg-black/30 p-2.5 text-xs space-y-0.5">
          {Object.entries(r.details ?? {}).map(([k, v]) => (
            <div key={k}><span className="text-muted capitalize">{k.replace(/([A-Z])/g, " $1")}:</span> <b>{String(v)}</b></div>
          ))}
        </div>
      </details>

      <div className="mt-3 flex flex-wrap items-start gap-3">
        {r.status === "pending" && (
          <>
            <form action={approveRedeem.bind(null, r.id)}>
              <button className="glow-btn pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white">Approve — notify gamer to confirm</button>
            </form>
            <form action={rejectRedeem.bind(null, r.id)}>
              <button className="rounded-full border border-rose-400/40 text-rose-300 px-4 py-1.5 text-sm hover:bg-rose-500/10">Reject</button>
            </form>
          </>
        )}
        {r.status === "approved" && (
          <>
            <form action={markRedeemPaid.bind(null, r.id)} className="flex flex-wrap items-end gap-3">
              <ImageUpload name="proofUrl" label="Payment confirmation screenshot" aspect="16/9" maxDim={1400} scope="misc" previewWidth={110} />
              <button className="pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white" style={{ background: "linear-gradient(90deg,#10b981,#22d3ee)" }}>
                Mark paid — remove trophies from profile
              </button>
            </form>
            <form action={rejectRedeem.bind(null, r.id)}>
              <button className="rounded-full border border-rose-400/40 text-rose-300 px-4 py-1.5 text-sm hover:bg-rose-500/10">Cancel &amp; return trophies</button>
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2 flex items-center gap-2"><Icon name="trophy" size={20} className="text-amber-300" /> Trophy redemptions</h1>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Gamers cash out their trophy $ values here. Approve → the gamer confirms their payout method →
        pay them (5–7 business days) and upload the payment confirmation → the trophies leave their profile.
      </p>
      {rows.length === 0 && <div className="glass p-8 text-center text-sm text-muted">No redeem requests yet.</div>}
      <div className="space-y-4">
        {open.map(card)}
        {closed.length > 0 && <div className="text-[10px] uppercase tracking-widest text-muted pt-2">History</div>}
        {closed.map(card)}
      </div>
    </div>
  );
}
