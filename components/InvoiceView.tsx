import Icon from "@/components/Icon";
import { money } from "@/lib/pricing";
import type { Invoice } from "@/lib/invoices";

// One invoice, rendered the same way everywhere it appears — the admin console,
// the brand's Billing tab and the public pay page all show the identical
// document. That is deliberate: a brand disputing a line and a staff member
// looking at the same line should be looking at the same thing, not at two
// layouts that might have diverged.

const STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "#94a3b8" },
  sent: { label: "Awaiting payment", color: "#fbbf24" },
  paid: { label: "Paid", color: "#34d399" },
  void: { label: "Void", color: "#64748b" },
};

export function InvoiceStatus({ invoice }: { invoice: Invoice }) {
  const s = STATUS[invoice.status] ?? STATUS.draft;
  const overdue = invoice.overdue;
  const color = overdue ? "#fb7185" : s.color;
  return (
    <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
      style={{ background: `${color}22`, color }}>
      {overdue ? "Overdue" : s.label}
    </span>
  );
}

export function DueLine({ invoice }: { invoice: Invoice }) {
  if (invoice.status === "paid") {
    return <span className="text-emerald-300">Paid {invoice.paidAt ? invoice.paidAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}</span>;
  }
  if (!invoice.dueAt) return <span className="text-muted">No due date set</span>;
  const d = invoice.dueAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (invoice.overdue) {
    const days = Math.abs(invoice.daysUntilDue ?? 0);
    return <span className="text-rose-300">Due {d} — {days} {days === 1 ? "day" : "days"} overdue</span>;
  }
  return <span className="text-muted">Due {d}{invoice.daysUntilDue !== null ? ` · ${invoice.daysUntilDue} days` : ""}</span>;
}

/** The document itself: lines, discounts and a total that is their sum. */
export default function InvoiceView({ invoice, dense = false }: { invoice: Invoice; dense?: boolean }) {
  const cur = invoice.currency;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-muted">
            <tr className="border-b border-white/10">
              <th className="py-2 text-left">Item</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.length === 0 && (
              <tr><td colSpan={4} className="py-4 text-center text-muted">Nothing on this invoice yet.</td></tr>
            )}
            {invoice.lines.map((l) => (
              <tr key={l.id} className="border-b border-white/5">
                <td className={`py-2 pr-3 ${l.amount < 0 ? "text-emerald-200" : ""}`}>
                  {l.label}
                  {!dense && l.kind !== "adjustment" && (
                    <span className="ml-2 rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted">{l.kind}</span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums text-muted">{l.quantity === 1 ? "" : l.quantity}</td>
                <td className="py-2 text-right tabular-nums text-muted">{l.quantity === 1 ? "" : money(l.unitAmount, cur)}</td>
                <td className={`py-2 text-right font-semibold tabular-nums ${l.amount < 0 ? "text-emerald-300" : ""}`}>
                  {money(l.amount, cur)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between text-muted"><span>Subtotal</span><span className="tabular-nums">{money(invoice.subtotal, cur)}</span></div>
        {invoice.discount > 0 && (
          <div className="flex justify-between text-emerald-300"><span>Discounts</span><span className="tabular-nums">−{money(invoice.discount, cur)}</span></div>
        )}
        <div className="flex justify-between border-t border-white/10 pt-1 text-base font-black">
          <span>Total</span><span className="tabular-nums">{money(invoice.total, cur)}</span>
        </div>
      </div>

      {invoice.notes && (
        <p className="mt-4 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-muted whitespace-pre-line">{invoice.notes}</p>
      )}
    </div>
  );
}

/** The "pay this" block. Shared by the brand portal and the public pay page. */
export function PayBlock({ invoice }: { invoice: Invoice }) {
  if (invoice.status === "paid") {
    return (
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.07] p-5 text-center">
        <Icon name="check" size={22} className="mx-auto mb-1.5 text-emerald-300" />
        <div className="font-bold text-emerald-200">Paid in full</div>
        <div className="mt-0.5 text-xs text-muted">
          {money(invoice.total, invoice.currency)}
          {invoice.paidVia ? ` via ${invoice.paidVia}` : ""}
          {invoice.paidRef ? ` · ref ${invoice.paidRef}` : ""}
        </div>
      </div>
    );
  }
  if (invoice.status === "void") {
    return <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-center text-sm text-muted">This invoice was withdrawn. Nothing is owed.</div>;
  }
  if (!invoice.payLinkUrl) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-center text-sm text-muted">
        We&apos;re setting up the payment link for this one. It&apos;ll appear here — nothing to do yet.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.06] p-5 text-center">
      <div className="text-xs uppercase tracking-widest text-muted">Amount due</div>
      <div className="my-1 text-3xl font-black text-cyan-200">{money(invoice.total, invoice.currency)}</div>
      <div className="mb-3 text-xs"><DueLine invoice={invoice} /></div>
      {/* `brand-btn`, the purple one — the codebase's existing convention for
          anything a BRAND clicks (pricing, enquiry, the portal), and this is
          the most consequential click a brand makes. */}
      <a href={invoice.payLinkUrl} target="_blank" rel="noreferrer"
        className="brand-btn pressable inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white">
        <Icon name="zap" size={14} /> Pay invoice {invoice.number}
      </a>
      <p className="mt-3 text-[11px] text-muted">
        Payment is handled by our payment provider on their own secure page. Cluster never sees or stores your card
        or bank details.
      </p>
    </div>
  );
}
