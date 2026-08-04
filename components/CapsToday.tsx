import Icon from "@/components/Icon";
import CpIcon from "@/components/CpIcon";
import type { CapsToday as Caps } from "@/lib/quests";

function resetIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "any moment";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Today's caps, and what has already maxed out (B17).
 *
 * **Nothing here interrupts.** It is not a warning, it does not appear as a
 * toast, and it never blocks an action — the post still posts and the ad still
 * counts for the brand; it simply stopped earning. This panel exists so that
 * "why did that not give me anything?" has an answer for anybody who goes
 * looking, with the exact figure and the reset time.
 *
 * It renders only where a gamer is already reading their CP history, which is
 * the one place someone asks that question.
 */
export default function CapsToday({ caps }: { caps: Caps }) {
  const maxed = caps.actions.filter((a) => a.maxed);
  const running = caps.actions.filter((a) => !a.maxed);
  if (caps.actions.length === 0 && !caps.ceilingHit) return null;

  return (
    <div className="glass p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-bold">
          <Icon name="clock" size={16} className="text-amber-300" /> Today&rsquo;s limits
        </h3>
        <span className="text-[11px] text-muted">Everything resets in {resetIn(caps.resetsAt)}</span>
      </div>

      {/* The one guarantee, whatever the per-action numbers say. */}
      <div className={`mb-3 rounded-2xl border px-4 py-3 ${caps.ceilingHit ? "border-amber-400/40 bg-amber-500/5" : "border-white/10"}`}>
        <div className="flex flex-wrap items-baseline gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 font-bold text-cyan-200">
            <CpIcon size={15} /> {caps.earned.toLocaleString()}
          </span>
          <span className="text-muted">of {caps.ceiling.toLocaleString()} earned today</span>
          {caps.ceilingHit && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
              daily maximum reached
            </span>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
          <div className={`h-full rounded-full ${caps.ceilingHit ? "bg-amber-400" : "bg-cyan-400"}`}
            style={{ width: `${Math.min(100, caps.ceiling > 0 ? (caps.earned / caps.ceiling) * 100 : 0)}%` }} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          {caps.ceilingHit
            ? "Everything still works — posts post, challenges count, ads count for the brand. They just stop paying until the reset."
            : "The most anyone can earn in a day, across every action and every quest."}
        </p>
      </div>

      {maxed.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {maxed.map((a) => (
            <div key={`${a.key}-${a.questName}`} className="flex items-center gap-2.5 rounded-xl border border-amber-400/25 bg-amber-500/5 px-3 py-2">
              <Icon name="check" size={14} className="shrink-0 text-amber-300" />
              <span className="min-w-0 flex-1 truncate text-sm">{a.label}</span>
              <span className="whitespace-nowrap text-[11px] font-semibold text-amber-300">
                daily maximum reached ({a.used}/{a.cap})
              </span>
            </div>
          ))}
        </div>
      )}

      {running.length > 0 && (
        <div className="space-y-1.5">
          {running.map((a) => (
            <div key={`${a.key}-${a.questName}`} className="flex items-center gap-2.5 px-1 text-xs">
              <span className="min-w-0 flex-1 truncate text-muted">{a.label}</span>
              <div className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full" style={{ width: `${(a.used / a.cap) * 100}%`, background: a.color }} />
              </div>
              <span className="w-14 shrink-0 text-right tabular-nums text-muted">{a.used}/{a.cap}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
