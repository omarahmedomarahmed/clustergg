import { OPS_SPLIT } from "@/lib/positioning";
import { money } from "@/lib/pricing";

// Where the money goes — the no-operations argument, drawn.
//
// "We are not a tournament organiser" is a sentence people nod at and forget.
// The same claim as two stacked bars is unforgettable: one has four cost lines
// before a player is paid anything, the other has prize money as the biggest
// block on the chart. That gap is the entire business.

const TONE: Record<string, string> = {
  "Production & venue": "#f87171",
  "Staff & match admins": "#fb923c",
  "Marketing & sign-up": "#facc15",
  "Prize money": "#34d399",
  Platform: "#a78bfa",
};

export default function OpsSplit({
  title, subtitle, spend, currency = "USD",
}: {
  title?: string;
  subtitle?: string;
  /** A single activation, used to put real money on the segments. */
  spend?: number;
  currency?: string;
}) {
  return (
    <div>
      {(title || subtitle) && (
        <div className="mx-auto mb-8 max-w-2xl text-center">
          {title && <h2 className="text-3xl md:text-4xl font-bold">{title}</h2>}
          {subtitle && <p className="mt-3 leading-relaxed text-muted">{subtitle}</p>}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {OPS_SPLIT.map((col) => {
          const ours = col.key === "cluster";
          return (
            <div
              key={col.key}
              className={`rounded-3xl border p-5 sm:p-6 ${
                ours ? "border-violet-400/30 bg-violet-500/[0.07]" : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className={`text-lg font-bold ${ours ? "brand-text" : ""}`}>{col.title}</div>
              <p className="mt-1 text-xs leading-snug text-muted">{col.sub}</p>

              {/* The bar. One row, segments to scale. */}
              <div className="mt-5 flex h-9 w-full overflow-hidden rounded-full ring-1 ring-white/10">
                {col.lines.map((l) => (
                  <div
                    key={l.label}
                    style={{ width: `${l.pct}%`, background: TONE[l.label] ?? "#64748b" }}
                    className="h-full"
                    title={`${l.label} — ${l.pct}%`}
                  />
                ))}
              </div>

              <ul className="mt-4 space-y-2">
                {col.lines.map((l) => (
                  <li key={l.label} className="flex items-baseline gap-2.5">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TONE[l.label] ?? "#64748b" }} />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-semibold">{l.label}</span>
                      <span className="block text-[11px] leading-snug text-muted">{l.note}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums">
                      {l.pct}%
                      {spend ? (
                        <span className="ml-1.5 text-[11px] font-normal text-muted">
                          {money(Math.round((spend * l.pct) / 100), currency)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
