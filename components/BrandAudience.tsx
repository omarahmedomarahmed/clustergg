import Icon from "@/components/Icon";
import { COHORT_FLOOR, type Audience } from "@/lib/segments";

// The audience, in aggregate, for a brand. B89.5.
//
// A brand asked to see "the gamers". This is the answer, and the shape of it is
// the answer to a second question they did not ask: what will we never show
// you. Every number is a count over a group, every group is over the floor, and
// there is no drill-down, no export and no row a person can be picked out of.
//
// The suppression notice is not an apology. A brand that can see the rule
// working can trust the numbers that got through it — and, more practically, a
// brand that knows a floor exists stops asking us to go under it.

export default function BrandAudience({ audience }: { audience: Audience }) {
  const n = (v: number) => v.toLocaleString("en-US");

  if (audience.total < COHORT_FLOOR) {
    return (
      <section className="glass p-6">
        <h2 className="font-bold">Who is out there</h2>
        <p className="mt-2 text-sm text-muted">
          Not enough linked gamers yet to describe honestly. We will not show you a shape built out
          of a handful of people — this fills in as the network grows.
        </p>
      </section>
    );
  }

  return (
    <section className="glass p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-bold">Who is out there</h2>
        <span className="text-sm text-muted">
          <b className="text-ink tabular-nums">{n(audience.total)}</b> gamers with a verified game account
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Aggregate only. Every group below has at least {COHORT_FLOOR} people in it, and anything
        smaller is withheld rather than rounded — a count of three is three people somebody can name.
        There is nothing here to click through to, and no export.
      </p>

      <div className="mt-5 space-y-5">
        {audience.segments.map((s) => (
          <div key={s.dimension}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold">{s.dimension}</h3>
              <span className="text-[11px] text-muted">{s.question}</span>
            </div>

            {s.slices.length === 0 ? (
              <p className="mt-2 text-xs text-muted">
                Nothing here is over the floor yet.
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {s.slices.map((x) => (
                  <div key={x.key} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 truncate text-xs">{x.label}</span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-cyan-400/70 to-violet-400/70"
                        style={{ width: `${Math.max(2, x.pct)}%` }}
                      />
                    </span>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted">
                      {n(x.gamers)} · {x.pct}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            {s.suppressed > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
                <Icon name="lock" size={11} className="mt-0.5 shrink-0 text-violet-300" />
                <span>
                  {n(s.suppressed)} more across {s.suppressedGroups} group
                  {s.suppressedGroups === 1 ? "" : "s"} too small to describe. They are in the total
                  above — they are just not a slice we will draw.
                </span>
              </p>
            )}
          </div>
        ))}
      </div>

      {audience.overlaps.length > 0 && (
        <div className="mt-6 border-t border-white/10 pt-4">
          <h3 className="text-sm font-bold">What they also play</h3>
          <p className="mt-1 text-[11px] text-muted">
            The same floor applies to the overlap itself, not just to each side of it.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {audience.overlaps.map((o) => (
              <div key={`${o.a}-${o.b}`} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs">
                <b>{o.pctOfA}%</b> of {o.a} players also play {o.b}
                <span className="block text-[11px] text-muted">{n(o.gamers)} gamers</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
