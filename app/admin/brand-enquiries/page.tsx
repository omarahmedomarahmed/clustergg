import Link from "next/link";
import Icon from "@/components/Icon";
import EnquiryRow from "@/components/EnquiryRow";
import { listEnquiries } from "@/lib/brand-enquiries";
import { getContent } from "@/lib/cms";
import { requireStaff } from "@/lib/auth";
import { buildPricing, money, PRICING_NUMBER_KEYS } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Brand enquiries" };

// The inbound sales queue.
//
// Each row carries the configuration the brand had on screen when they clicked,
// so whoever picks it up already knows the plan, the games and the budget. The
// list is ordered newest-first and the "new" ones are the queue — everything
// else is history you can still search.
export default async function BrandEnquiriesPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Guarded here as well as in middleware and the layout. This page holds names,
  // emails and phone numbers people gave us to do business — it does not get to
  // rely on a check that lives in another file.
  await requireStaff();
  const sp = await searchParams;
  const filter = (Array.isArray(sp.status) ? sp.status[0] : sp.status) ?? "";
  const [rows, content] = await Promise.all([
    listEnquiries(filter || undefined, 200),
    getContent(PRICING_NUMBER_KEYS),
  ]);
  const cfg = buildPricing(content);

  const counts = {
    all: rows.length,
    pipeline: rows.filter((r) => r.status === "new" || r.status === "contacted")
      .reduce((s, r) => s + r.quotedMonthly, 0),
  };

  const TABS: { key: string; label: string }[] = [
    { key: "", label: "All" },
    { key: "new", label: "New" },
    { key: "contacted", label: "Contacted" },
    { key: "won", label: "Won" },
    { key: "lost", label: "Lost" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Brand enquiries</h1>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Every brand who used the form on <Link href="/brands" className="text-cyan-300 hover:underline">/brands</Link>,
        with the plan they had configured when they sent it. Reply from your own inbox — this is a record, not a mailbox.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {TABS.map((t) => (
          <Link
            key={t.key || "all"}
            href={t.key ? `/admin/brand-enquiries?status=${t.key}` : "/admin/brand-enquiries"}
            className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${
              filter === t.key ? "bg-violet-500/25 border-violet-400/50 text-ink font-semibold" : "bg-white/5 border-white/10 text-muted hover:text-ink"
            }`}
          >{t.label}</Link>
        ))}
        {counts.pipeline > 0 && (
          <span className="ml-auto text-sm text-muted">
            Open pipeline: <b className="text-emerald-300">{money(counts.pipeline, cfg.currency)}</b>/month quoted
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="glass p-10 text-center">
          <Icon name="send" size={26} className="text-violet-300 mx-auto" />
          <div className="font-semibold mt-3">Nothing here yet.</div>
          <p className="text-sm text-muted mt-1.5 max-w-md mx-auto">
            Enquiries land here the moment a brand sends the form. If /pricing is live and this stays empty,
            the problem is traffic, not the form.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => <EnquiryRow key={r.id} row={{ ...r, createdAt: r.createdAt.toISOString() }} currency={cfg.currency} />)}
        </div>
      )}
    </div>
  );
}
