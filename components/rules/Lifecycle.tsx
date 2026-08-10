import Icon from "@/components/Icon";
import { LIFECYCLE } from "@/lib/journeys";

// The five states a challenge passes through, and the two gates that matter.
//
// Rendered from `STAGE_ORDER` and `STAGES`, which is what the product itself
// reads — the admin ladder, the card renderer and the Discord resolver all
// derive from the same two exports, so this diagram cannot show a rung the
// product does not have.
//
// The two gates are called out separately because they are the least obvious
// thing in the whole model and the one that produces "why is my score zero":
// ANNOUNCED makes a challenge visible and joinable days early, LIVE is when
// scoring starts for everybody at once.

const TONE: Record<string, string> = {
  mute: "#94a3b8",
  warn: "#fbbf24",
  good: "#34d399",
  bad: "#f472b6",
};

export default function Lifecycle() {
  return (
    <div className="glass rounded-3xl p-6">
      <h3 className="text-lg font-bold">What a challenge does, week by week</h3>

      <ol className="mt-5 grid gap-2 sm:grid-cols-5">
        {LIFECYCLE.map((s, i) => (
          <li key={s.key} className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: TONE[s.tone] }} />
              <span className="text-sm font-bold">{s.label}</span>
              <span className="ml-auto text-[10px] tabular-nums text-muted">{i + 1}</span>
            </div>
            <p className="mt-1.5 text-xs leading-snug text-muted">{s.blurb}</p>
          </li>
        ))}
      </ol>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <p className="flex items-start gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-3 text-sm leading-relaxed">
          <Icon name="eye" size={13} className="mt-1 shrink-0 text-amber-300" />
          <span className="text-muted">
            <b className="text-ink">Announced</b> is the first gate. Every server it runs in is told days
            before it starts, so a competition has time to gather a field.
          </span>
        </p>
        <p className="flex items-start gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.07] p-3 text-sm leading-relaxed">
          <Icon name="zap" size={13} className="mt-1 shrink-0 text-emerald-300" />
          <span className="text-muted">
            <b className="text-ink">Live</b> is the second. Scoring begins for everybody at the same
            moment, so entering on announcement day buys no head start.
          </span>
        </p>
      </div>

      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <Icon name="lock" size={12} className="mt-0.5 shrink-0 text-cyan-300" />
        <span>
          Nothing is announced before its invoice clears. That check is the only thing standing between a
          handshake and a promise made to every server on the network.
        </span>
      </p>
    </div>
  );
}
