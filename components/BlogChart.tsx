import type { Chart } from "@/lib/blog";

// A bar chart with no charting library, because it's four numbers and a
// dependency for four numbers is a dependency that will one day break a build
// for four numbers. Same reasoning as components/viz/EarnCurve.tsx.
//
// The bar's LENGTH comes from `value`; the label printed on it comes from
// `display`. Those are deliberately separate: a percentage bar and a money
// label are different quantities, and computing one from the other is how a
// chart ends up quietly lying.

const FILL: Record<NonNullable<Chart["bars"][number]["accent"]>, string> = {
  violet: "bg-violet-500/70",
  cyan: "bg-cyan-400/70",
  emerald: "bg-emerald-400/70",
  amber: "bg-amber-400/70",
};

export default function BlogChart({
  chart, title, note,
}: { chart: Chart; title: string; note?: string }) {
  const max = Math.max(...chart.bars.map((b) => b.value), 1);

  return (
    <figure className="glass rounded-2xl p-5">
      <figcaption className="text-sm font-bold text-ink">{title}</figcaption>
      {note && <p className="mt-1 text-xs leading-relaxed text-muted">{note}</p>}

      <div className="mt-4 space-y-3">
        {chart.bars.map((b) => (
          <div key={b.label}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-semibold text-ink">{b.label}</span>
              <span className="font-black tabular-nums text-ink">{b.display}</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/8">
              <div
                className={`h-full rounded-full ${FILL[b.accent ?? "violet"]}`}
                // Never 0% — a bar with no width reads as a rendering bug rather
                // than as a small number.
                style={{ width: `${Math.max(2, Math.round((b.value / max) * 100))}%` }}
              />
            </div>
            {b.hint && <p className="mt-1 text-[11px] leading-snug text-muted">{b.hint}</p>}
          </div>
        ))}
      </div>

      <p className="mt-4 border-t border-white/10 pt-2.5 text-[10px] uppercase tracking-widest text-muted">
        Source · {chart.source}
      </p>
    </figure>
  );
}
