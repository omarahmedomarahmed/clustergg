import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { stuckMoney, stuckTotal, UNCLAIMED_HOLD_DAYS, type StuckKind } from "@/lib/stuck-money";
import Icon from "@/components/Icon";
import FeatureShot from "@/components/FeatureShot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Stuck money" };

const TONE: Record<StuckKind, { label: string; cls: string }> = {
  failed_payout: { label: "needs a decision", cls: "bg-rose-500/15 text-rose-300" },
  owner_gone: { label: "needs a decision", cls: "bg-rose-500/15 text-rose-300" },
  unfilled_podium: { label: "needs a decision", cls: "bg-amber-500/15 text-amber-300" },
  no_payout_preference: { label: "nothing owed", cls: "bg-slate-500/15 text-slate-300" },
  cancelled_with_entries: { label: "nothing owed", cls: "bg-slate-500/15 text-slate-300" },
};

/**
 * Money with no owner and no screen (B39).
 *
 * Six states where a prize ends up in limbo. Every one was already reachable;
 * none of them were visible, which is how a support queue becomes a spreadsheet.
 *
 * The page separates **needs a decision** from **nothing owed** on purpose. A
 * gamer who has never chosen a payout method is not a problem to solve — their
 * trophy keeps its value indefinitely and nothing expires — but it IS something
 * staff should be able to see before somebody asks. Mixing the two would make
 * the urgent list unreadable within a week.
 */
export default async function StuckMoneyPage() {
  await requireSystemFor("/admin/stuck");
  const db = await getDb();
  const rows = await stuckMoney(db);
  const total = stuckTotal(rows);
  const decide = rows.filter((r) => TONE[r.kind].label === "needs a decision");
  const noted = rows.filter((r) => TONE[r.kind].label === "nothing owed");

  const card = (r: (typeof rows)[number]) => (
    <div key={`${r.kind}:${r.id}`} className="glass p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${TONE[r.kind].cls}`}>
          {TONE[r.kind].label}
        </span>
        <span className="min-w-0 flex-1 font-semibold">{r.title}</span>
        {r.amount > 0 && (
          <span className="shrink-0 text-lg font-black text-amber-200">
            ${r.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted">{r.why}</p>
      <p className="mt-1 text-xs">
        <b className="text-ink">What unsticks it:</b> <span className="text-muted">{r.action}</span>
        {r.href && <> · <Link href={r.href} className="text-cyan-300 hover:underline">Open</Link></>}
      </p>
    </div>
  );

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Stuck money</h1>
      <p className="mb-6 max-w-3xl text-sm text-muted">
        Every state where a prize has nowhere to go — what is stuck, why, and the action that unsticks it.
        Money with no owner and no screen is how a support queue becomes a spreadsheet.
      </p>

      <FeatureShot shotKey="admin.stuck.money" className="mb-6" />

      <div className="glass mb-6 flex flex-wrap items-center gap-6 p-5">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted">In limbo</div>
          <div className={`text-3xl font-black ${total > 0 ? "text-amber-200" : "text-emerald-300"}`}>
            ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <p className="max-w-xl text-xs text-muted">
          Counts only what genuinely needs a decision. A gamer who has not chosen a payout method is not a debt —
          their trophy holds its value indefinitely and nothing expires — so it is listed below rather than added
          here. An unclaimed prize is held {UNCLAIMED_HOLD_DAYS} days after the account closes before it is written off.
        </p>
      </div>

      {decide.length === 0 ? (
        <div className="glass p-8 text-center text-sm text-muted">
          <Icon name="check" size={18} className="mr-2 inline text-emerald-300" />
          Nothing needs a decision. Every prize has somewhere to go.
        </div>
      ) : (
        <div className="space-y-3">{decide.map(card)}</div>
      )}

      {noted.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-bold">Worth knowing, nothing owed</h2>
          <div className="space-y-3">{noted.map(card)}</div>
        </>
      )}
    </div>
  );
}
