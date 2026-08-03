"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import {
  addInvoiceLine, deleteInvoice, deleteInvoiceLine, markInvoicePaid,
  rotatePayToken, sendInvoice, setInvoicePayLink, setInvoiceStatus, updateInvoice, updateInvoiceLine,
} from "@/app/actions/billing";
import { INVOICE_KINDS, type Invoice } from "@/lib/invoices";

// Staff editing a bill.
//
// Every line is editable, including the ones the pricing model generated, and a
// discount is a line with a negative amount rather than a special field. That's
// the whole design: sales negotiates, the invoice prints what was agreed, and
// nobody has to rebuild the document in a spreadsheet — which is what happens
// the first time the software refuses a number somebody already promised.

const money = (n: number, cur: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n);

type Res = { ok?: true; error?: string; message?: string };

export default function InvoiceEditor({ invoice, payHint }: { invoice: Invoice; payHint: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const locked = invoice.status === "paid" || invoice.status === "void";

  const run = (fn: () => Promise<Res>) => start(async () => {
    setMsg(null);
    const res = await fn();
    if (res.error) setMsg({ tone: "err", text: res.error });
    else { setMsg({ tone: "ok", text: res.message ?? "Saved." }); setEditing(null); router.refresh(); }
  });

  const field = "input-cosmic !py-1 text-xs";

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`rounded-xl border px-3 py-2 text-sm ${
          msg.tone === "ok" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-rose-400/30 bg-rose-500/10 text-rose-200"}`}>
          {msg.text}
        </div>
      )}

      {/* ===== Lines ===== */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-muted">
            <tr className="border-b border-white/10">
              <th className="py-2 text-left">Item</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Amount</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => editing === l.id ? (
              <tr key={l.id} className="border-b border-white/5 bg-white/[0.03]">
                <td colSpan={5} className="py-2">
                  <form
                    action={(fd) => run(() => updateInvoiceLine(l.id, fd))}
                    className="flex flex-wrap items-end gap-2">
                    <input name="label" defaultValue={l.label} className={`${field} min-w-[16rem] flex-1`} />
                    <input name="quantity" type="number" step="0.01" defaultValue={l.quantity} className={`${field} w-20`} />
                    <input name="unitAmount" type="number" step="0.01" defaultValue={l.unitAmount} className={`${field} w-28`} />
                    <button disabled={pending} className="rounded-full bg-emerald-500/25 px-3 py-1 text-xs font-bold text-emerald-100">Save</button>
                    <button type="button" onClick={() => setEditing(null)} className="rounded-full bg-white/5 px-3 py-1 text-xs text-muted">Cancel</button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={l.id} className="border-b border-white/5">
                <td className={`py-2 pr-3 ${l.amount < 0 ? "text-emerald-200" : ""}`}>
                  {l.label}
                  <span className="ml-2 rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted">{l.kind}</span>
                </td>
                <td className="py-2 text-right tabular-nums text-muted">{l.quantity}</td>
                <td className="py-2 text-right tabular-nums text-muted">{money(l.unitAmount, invoice.currency)}</td>
                <td className={`py-2 text-right font-semibold tabular-nums ${l.amount < 0 ? "text-emerald-300" : ""}`}>{money(l.amount, invoice.currency)}</td>
                <td className="py-2 pl-3 text-right whitespace-nowrap">
                  {!locked && (
                    <>
                      <button onClick={() => setEditing(l.id)} className="text-xs text-cyan-300 hover:underline">Edit</button>
                      <button onClick={() => run(() => deleteInvoiceLine(l.id))} disabled={pending} className="ml-2 text-xs text-rose-300 hover:underline">Remove</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between text-muted"><span>Subtotal</span><span className="tabular-nums">{money(invoice.subtotal, invoice.currency)}</span></div>
        {invoice.discount > 0 && <div className="flex justify-between text-emerald-300"><span>Discounts</span><span className="tabular-nums">−{money(invoice.discount, invoice.currency)}</span></div>}
        <div className="flex justify-between border-t border-white/10 pt-1 text-base font-black"><span>Total</span><span className="tabular-nums">{money(invoice.total, invoice.currency)}</span></div>
      </div>

      {!locked && (
        <form action={(fd) => run(() => addInvoiceLine(invoice.id, fd))}
          className="flex flex-wrap items-end gap-2 rounded-2xl border border-white/10 bg-black/25 p-3">
          <label className="text-[10px] uppercase tracking-widest text-muted">
            Type
            <select name="kind" defaultValue="challenge" className={`${field} mt-0.5 block w-36`}>
              {INVOICE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </label>
          <label className="min-w-[14rem] flex-1 text-[10px] uppercase tracking-widest text-muted">
            What it&apos;s for
            <input name="label" required placeholder="e.g. Extra Valorant challenge — week 3" className={`${field} mt-0.5 block w-full`} />
          </label>
          <label className="text-[10px] uppercase tracking-widest text-muted">
            Qty
            <input name="quantity" type="number" step="0.01" defaultValue={1} className={`${field} mt-0.5 block w-20`} />
          </label>
          <label className="text-[10px] uppercase tracking-widest text-muted">
            Rate
            <input name="unitAmount" type="number" step="0.01" defaultValue={0} className={`${field} mt-0.5 block w-28`} />
          </label>
          <button disabled={pending} className="rounded-full bg-cyan-500/25 px-4 py-1.5 text-xs font-bold text-cyan-100">Add line</button>
          <p className="w-full text-[10px] text-muted">
            A discount or credit is stored as a negative amount — type it positive and we&apos;ll flip it.
          </p>
        </form>
      )}

      {/* ===== Terms and notes ===== */}
      <details className="rounded-2xl border border-white/10 bg-black/20 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-cyan-300">Terms, period and notes</summary>
        <form action={(fd) => run(() => updateInvoice(invoice.id, fd))} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-[10px] uppercase tracking-widest text-muted">
            Period
            <input name="periodLabel" defaultValue={invoice.periodLabel ?? ""} className={`${field} mt-0.5 block w-44`} />
          </label>
          <label className="text-[10px] uppercase tracking-widest text-muted">
            Due date
            <input name="dueAt" type="date" defaultValue={invoice.dueAt ? invoice.dueAt.toISOString().slice(0, 10) : ""} className={`${field} mt-0.5 block w-40`} />
          </label>
          <label className="min-w-[16rem] flex-1 text-[10px] uppercase tracking-widest text-muted">
            Notes on the invoice
            <textarea name="notes" rows={2} defaultValue={invoice.notes ?? ""} placeholder="PO number, terms, anything the brand should read." className={`${field} mt-0.5 block w-full`} />
          </label>
          <button disabled={pending} className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold">Save</button>
        </form>
      </details>

      {/* ===== Where they pay ===== */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
          <Icon name="link" size={13} className="text-cyan-300" /> Payment link
          {invoice.payProvider && <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted">{invoice.payProvider}</span>}
        </div>
        {invoice.payLinkUrl ? (
          <a href={invoice.payLinkUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-cyan-300 hover:underline">{invoice.payLinkUrl}</a>
        ) : (
          <p className="text-xs text-muted">
            Nothing attached. {payHint ?? "Raise the request in your provider's dashboard and paste the link here."}
          </p>
        )}
        <form action={(fd) => run(() => setInvoicePayLink(invoice.id, fd))} className="mt-2 flex flex-wrap items-end gap-2">
          <input name="payLinkUrl" placeholder="https://… paste from Payoneer, Wise, your bank" className={`${field} min-w-[18rem] flex-1`} />
          <input name="provider" placeholder="provider name" className={`${field} w-36`} />
          <button disabled={pending} className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold">Attach</button>
          <button
            type="submit"
            formAction={(fd) => { fd.set("payLinkUrl", ""); return run(() => setInvoicePayLink(invoice.id, fd)); }}
            disabled={pending}
            className="rounded-full border border-cyan-400/40 px-4 py-1.5 text-xs font-bold text-cyan-200">
            Or ask the provider to mint one
          </button>
        </form>
        {invoice.payToken && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span>Hosted page:</span>
            <a href={`/pay/${invoice.payToken}`} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">/pay/{invoice.payToken.slice(0, 10)}…</a>
            <button onClick={() => run(() => rotatePayToken(invoice.id))} disabled={pending} className="text-rose-300 hover:underline">rotate</button>
          </div>
        )}
      </div>

      {/* ===== Lifecycle ===== */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        {invoice.status === "draft" && (
          <>
            <button onClick={() => run(() => sendInvoice(invoice.id))} disabled={pending}
              className="glow-btn pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white">Send to brand</button>
            <button onClick={() => run(() => deleteInvoice(invoice.id))} disabled={pending}
              className="rounded-full border border-rose-400/40 px-4 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10">Delete draft</button>
          </>
        )}
        {invoice.status === "sent" && (
          <>
            <form action={(fd) => run(() => markInvoicePaid(invoice.id, fd))} className="flex flex-wrap items-end gap-2">
              <input name="paidVia" placeholder="paid via (bank, Payoneer…)" className={`${field} w-48`} />
              <input name="paidRef" placeholder="reference" className={`${field} w-40`} />
              <button disabled={pending} className="pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white"
                style={{ background: "linear-gradient(90deg,#10b981,#22d3ee)" }}>Mark paid</button>
            </form>
            <button onClick={() => run(() => setInvoiceStatus(invoice.id, "void"))} disabled={pending}
              className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-muted hover:text-ink">Void</button>
          </>
        )}
        {invoice.status === "paid" && (
          <button onClick={() => run(() => setInvoiceStatus(invoice.id, "sent"))} disabled={pending}
            className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-muted hover:text-ink">Reopen — mark unpaid</button>
        )}
        {invoice.status === "void" && (
          <button onClick={() => run(() => setInvoiceStatus(invoice.id, "draft"))} disabled={pending}
            className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-muted hover:text-ink">Restore as draft</button>
        )}
      </div>
    </div>
  );
}
