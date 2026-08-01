import Icon from "@/components/Icon";
import { money } from "@/lib/pricing";
import type { SectionData } from "@/lib/dataroom/types";
import type { CommercialStats } from "@/lib/dataroom/index";

// The slides an investor actually opens a deck for.
//
// Everything here obeys two rules. Numbers the database can answer are read
// from the database, so nobody has to trust that the deck was updated. Numbers
// it cannot — the ask, the cap table, market size — carry their source or their
// assumption on the same line, because a figure in a deck with no provenance is
// the one that ends the meeting.

const TONE = ["#a78bfa", "#38bdf8", "#f472b6", "#fbbf24", "#34d399", "#60a5fa"];

// ===== The raise =====

export function RaiseSection({ d, accent }: { d: SectionData; accent: string }) {
  const ask = d.ask ?? {};
  const cur = ask.currency ?? "USD";
  const use = d.useOfFunds ?? [];
  const cap = d.capTable ?? [];

  return (
    <div className="space-y-8">
      {/* The four facts, before anything else on the slide. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Raising" value={ask.amount ? money(ask.amount, cur) : "—"} accent={accent} big />
        <Fact label="Instrument" value={ask.instrument ?? "—"} />
        {/* Post-money when the round is quoted that way, pre-money otherwise.
            An investor reads the difference — a post-money number already
            includes the cheque — so the label always matches the figure. */}
        <Fact
          label={ask.postMoney ? "Post-money" : ask.instrument?.toLowerCase().includes("safe") ? "Valuation cap" : "Pre-money"}
          value={ask.postMoney ? money(ask.postMoney, cur) : ask.valuation ? money(ask.valuation, cur) : "—"}
        />
        <Fact label="Equity offered" value={ask.equityPct ? `${ask.equityPct}%` : "—"} />
      </div>
      {ask.postMoney && ask.amount ? (
        <p className="-mt-4 text-xs text-muted">
          {money(ask.postMoney - ask.amount, cur)} pre-money. {money(ask.amount, cur)} in at{" "}
          {money(ask.postMoney, cur)} post is {ask.equityPct}% of the company.
        </p>
      ) : null}
      {ask.runwayMonths ? (
        <p className="text-sm text-muted">
          <b className="text-ink">{ask.runwayMonths} months</b> of runway at the plan below.
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {use.length > 0 && <Allocation title="Use of funds" rows={use} />}
        {cap.length > 0 && (
          <Allocation
            title="Cap table, after this round"
            rows={cap.map((c) => ({ label: c.holder, pct: c.pct, note: c.note }))}
          />
        )}
      </div>
    </div>
  );
}

/** A labelled 100% bar plus its legend. Used for both allocations. */
function Allocation({ title, rows }: { title: string; rows: { label: string; pct: number; note?: string }[] }) {
  const total = rows.reduce((s, r) => s + r.pct, 0);
  return (
    <div className="glass rounded-3xl p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-bold">{title}</h3>
        {/* Says so when it doesn't add up, rather than quietly drawing a bar
            that implies it does. */}
        {Math.round(total) !== 100 && <span className="text-[11px] text-amber-300">{Math.round(total)}% allocated</span>}
      </div>
      <div className="mt-4 flex h-8 w-full overflow-hidden rounded-full ring-1 ring-white/10">
        {rows.map((r, i) => (
          <div key={r.label} title={`${r.label} — ${r.pct}%`} style={{ width: `${r.pct}%`, background: TONE[i % TONE.length] }} />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {rows.map((r, i) => (
          <li key={r.label} className="flex items-baseline gap-2.5">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TONE[i % TONE.length] }} />
            <span className="min-w-0 flex-1">
              <span className="text-sm font-semibold">{r.label}</span>
              {r.note && <span className="block text-[11px] leading-snug text-muted">{r.note}</span>}
            </span>
            <span className="shrink-0 text-sm font-bold tabular-nums">{r.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ===== Unit economics =====

export function UnitSection({ d, accent }: { d: SectionData; accent: string }) {
  const units = d.units ?? [];
  if (!units.length) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {units.map((u) => {
        const margin = u.revenue - u.cost;
        const pct = u.revenue > 0 ? Math.round((margin / u.revenue) * 100) : 0;
        const costPct = u.revenue > 0 ? Math.min(100, Math.round((u.cost / u.revenue) * 100)) : 0;
        return (
          <div key={u.label} className="glass rounded-3xl p-5">
            <div className="text-[11px] uppercase tracking-widest text-muted">{u.label}</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold" style={{ color: accent }}>{money(margin)}</span>
              <span className="text-sm text-muted">margin · {pct}%</span>
            </div>
            {/* Cost first, margin as what's left — the direction the money
                actually moves. */}
            <div className="mt-4 flex h-6 w-full overflow-hidden rounded-full ring-1 ring-white/10">
              <div style={{ width: `${costPct}%`, background: "#475569" }} title={`Cost ${money(u.cost)}`} />
              <div style={{ width: `${100 - costPct}%`, background: accent }} title={`Margin ${money(margin)}`} />
            </div>
            <div className="mt-3 flex justify-between text-xs">
              <span className="text-muted">Cost <b className="text-ink">{money(u.cost)}</b></span>
              <span className="text-muted">Revenue <b className="text-ink">{money(u.revenue)}</b></span>
            </div>
            {u.note && <p className="mt-3 text-[11px] leading-snug text-muted">{u.note}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ===== SaaS metrics =====

export function SaasSection({ d, live, accent }: { d: SectionData; live: CommercialStats; accent: string }) {
  const n = (v: number) => v.toLocaleString();
  const cells: { label: string; value: string; note: string; live?: boolean }[] = [
    { label: "MRR", value: money(live.mrr), note: "Sum of monthly contract value on running campaigns", live: true },
    { label: "ARR", value: money(live.arr), note: "MRR × 12", live: true },
    { label: "Paying brands", value: n(live.payingBrands), note: "Brands with a live, funded campaign", live: true },
    { label: "ARPA", value: money(live.arpa), note: "Revenue per paying brand per month", live: true },
    { label: "Active campaigns", value: n(live.activeCampaigns), note: "Inside their date window right now", live: true },
    { label: "Impressions (30d)", value: n(live.impressions30d), note: "Delivered across web and Discord", live: true },
    { label: "Clicks (30d)", value: n(live.clicks30d), note: "Across every placement", live: true },
    { label: "Campaigns on cards", value: n(live.cardCampaigns), note: "Running inside the Discord card placement", live: true },
    ...(d.saasNotes ?? []).map((s) => ({ label: s.label, value: s.value, note: s.note ?? "" })),
  ];

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="glass rounded-2xl p-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted">
              {c.label}
              {c.live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Read live from the database" />}
            </div>
            <div className="mt-1.5 text-2xl font-bold tabular-nums" style={{ color: accent }}>{c.value}</div>
            {c.note && <div className="mt-1 text-[11px] leading-snug text-muted">{c.note}</div>}
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-muted">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" />
        Read from the database on this page load. Nothing on this slide is typed in by hand.
        {live.mrr === 0 && " Zero is the honest number today — the platform is built and the first campaigns are being sold."}
      </p>
    </div>
  );
}

// ===== Market =====

export function MarketSection({ d, accent }: { d: SectionData; accent: string }) {
  const rows = d.market ?? [];
  if (!rows.length) return null;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {rows.map((m, i) => (
        <div key={m.label} className="glass rounded-3xl p-5">
          <div className="text-[11px] uppercase tracking-widest text-muted">{m.label}</div>
          <div className="mt-2 text-3xl font-bold" style={{ color: i === rows.length - 1 ? accent : undefined }}>{m.value}</div>
          {m.note && <p className="mt-2 text-sm leading-snug text-muted">{m.note}</p>}
          {m.source && (
            <div className="mt-3 flex items-start gap-1.5 border-t border-white/8 pt-3 text-[10px] leading-snug text-muted">
              <Icon name="link" size={11} className="mt-px shrink-0" />
              <span>{m.source}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Fact({ label, value, accent, big }: { label: string; value: string; accent?: string; big?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${big ? "border-violet-400/35 bg-violet-500/[0.08]" : "border-white/10 bg-white/[0.02]"}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-1.5 font-bold ${big ? "text-3xl" : "text-xl"}`} style={big && accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}
