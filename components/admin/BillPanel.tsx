import Link from "next/link";
import Icon from "@/components/Icon";
import { KINDS, type Bill } from "@/lib/challenge-billing";

// The bill, on every challenge. B91.2.
//
// A server component with no interactivity on purpose: there is nothing to
// press here. Whoever owes it either pays through the invoice or the wallet,
// and a "mark paid" button on a challenge editor would be a way to record
// money that never arrived from the screen least equipped to check.
//
// The warning is the whole reason the panel exists, so it is rendered LOUD and
// only when there is one. A panel that always says something is a panel people
// stop reading, and the thing they would be skipping is "this challenge is
// paying out prize money nobody paid for".

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default function BillPanel({ bill }: { bill: Bill }) {
  const k = KINDS[bill.kind];
  return (
    <div className={`mt-4 rounded-2xl border p-4 ${
      bill.warning ? "border-amber-400/35 bg-amber-500/[0.06]" : "border-white/10 bg-black/25"
    }`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest">
          {k.label}
        </span>
        {bill.payer && (
          <span className="text-sm font-semibold">
            {bill.payer.type === "brand" ? "Billed to " : "Bought by "}
            {bill.href
              ? <Link href={bill.href} className="text-cyan-300 hover:underline">{bill.payer.name}</Link>
              : bill.payer.name}
          </span>
        )}
        {/* B101. The second brand, beside the first, with what each owes. A
            co-sponsored challenge showing one name is the screen that lets
            somebody announce it on half its funding. */}
        {bill.coPayer && (
          <span className="text-sm font-semibold">
            &amp; <span className="text-cyan-300">{bill.coPayer.name}</span>
          </span>
        )}
        {bill.amount > 0 && (
          <span className="text-sm font-black tabular-nums">{usd(bill.amount)}</span>
        )}
        {bill.split && bill.payer && bill.coPayer && (
          <span className="text-[11px] tabular-nums text-muted">
            {bill.payer.name} {usd(bill.split.lead)} · {bill.coPayer.name} {usd(bill.split.co)}
          </span>
        )}
        <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${
          bill.paid
            ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
            : "border border-white/15 text-muted"
        }`}>
          {bill.paid ? "Paid" : "Not paid"}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted">{k.blurb}</p>
      {bill.evidence && <p className="mt-1 text-[11px] text-muted">{bill.evidence}</p>}

      {bill.warning && (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold leading-relaxed text-amber-200">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
          <span>
            {bill.warning}{" "}
            <span className="font-normal text-amber-200/80">
              Half of what it pays out comes from the prize vault, which is other brands&apos; money.
            </span>
          </span>
        </p>
      )}
    </div>
  );
}
