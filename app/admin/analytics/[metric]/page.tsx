import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { METRICS, metricsWithWindow } from "@/lib/admin-metrics";
import type { MetricKey } from "@/lib/admin-nav";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const WINDOWS = [7, 14, 30, 90];

export async function generateMetadata({ params }: { params: Promise<{ metric: string }> }) {
  const { metric } = await params;
  const def = METRICS.find((m) => m.key === metric);
  return { title: def ? `Report · ${def.label}` : "Report" };
}

// One metric, one page, printable.
//
// The point is that it can leave the building: an investor update, a brand
// deck, a board pack. So it carries its own definition and the date it was
// taken — a number without those two things can't be checked by whoever
// receives it, and an unverifiable number in a deck is worse than no number.
export default async function MetricReport({ params, searchParams }: {
  params: Promise<{ metric: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdmin();
  const { metric } = await params;
  const sp = await searchParams;
  const days = WINDOWS.includes(Number(sp.days)) ? Number(sp.days) : 30;

  const def = METRICS.find((m) => m.key === metric);
  if (!def) notFound();

  const key = def.key as MetricKey;
  const { total, window } = await metricsWithWindow(days);
  const value = total[key];
  const inWindow = window[key];
  // Only event-shaped metrics have a meaningful window. For a stock count —
  // how many games exist — "in the last 30 days" is a different number that
  // this loader doesn't compute, so we say so instead of implying one.
  const windowed = (["botCommands", "adImpressions", "adClicks", "posts"] as MetricKey[]).includes(key);
  const share = windowed && value > 0 ? Math.round((inWindow / value) * 100) : null;

  // Related numbers, so the metric can be read in context rather than alone.
  const siblings = METRICS.filter((m) => m.group === def.group && m.key !== def.key);
  const taken = new Date();

  return (
    <div className="max-w-3xl print:max-w-none">
      <div className="flex items-center justify-between gap-3 mb-6 print:hidden">
        <Link href={`/admin/analytics?days=${days}`} className="text-sm text-cyan-300 hover:underline">
          ← All metrics
        </Link>
        <div className="flex items-center gap-2">
          {WINDOWS.map((d) => (
            <Link
              key={d}
              href={`/admin/analytics/${key}?days=${d}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                d === days ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200 font-semibold" : "border-white/12 text-muted hover:text-ink"
              }`}
            >
              {d}d
            </Link>
          ))}
          <PrintButton />
        </div>
      </div>

      <article className="glass p-8 print:bg-white print:text-black print:p-0">
        <div className="text-[11px] uppercase tracking-widest text-muted print:text-gray-500">
          ClusterGG · {def.group} · report generated {taken.toISOString().slice(0, 10)}
        </div>
        <h1 className="text-3xl font-black mt-2">{def.label}</h1>

        <div className="mt-7 flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <div className="text-5xl font-black text-cyan-300 print:text-black tabular-nums">
              {value.toLocaleString()}
            </div>
            <div className="text-xs uppercase tracking-widest text-muted mt-1">Total</div>
          </div>
          {windowed && (
            <div>
              <div className="text-3xl font-black tabular-nums">{inWindow.toLocaleString()}</div>
              <div className="text-xs uppercase tracking-widest text-muted mt-1">Last {days} days</div>
              {share !== null && (
                <div className="text-[11px] text-muted mt-0.5">{share}% of all time</div>
              )}
            </div>
          )}
        </div>

        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-widest text-muted mb-1.5">What this counts</h2>
          <p className="text-sm leading-relaxed">{def.definition}</p>
          {!windowed && (
            <p className="text-xs text-muted mt-2">
              This is a running total, not an event count — there is no meaningful &ldquo;in the last {days} days&rdquo;
              reading of it, so none is shown.
            </p>
          )}
        </section>

        {siblings.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xs uppercase tracking-widest text-muted mb-2.5">Read alongside</h2>
            <table className="w-full text-sm">
              <tbody>
                {siblings.map((s) => (
                  <tr key={s.key} className="border-t border-white/10 print:border-gray-300">
                    <td className="py-2 pr-4">{s.label}</td>
                    <td className="py-2 text-right tabular-nums font-bold">{total[s.key as MetricKey].toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className="mt-8 pt-4 border-t border-white/10 print:border-gray-300 text-[11px] text-muted">
          Taken {taken.toUTCString()}. Counted directly from the production database at that moment —
          no sampling, no estimation.
        </footer>
      </article>

      {def.href && (
        <Link href={def.href} className="ghost-btn pressable rounded-full px-5 py-2 text-sm inline-block mt-5 print:hidden">
          Open the console for this
        </Link>
      )}
    </div>
  );
}
