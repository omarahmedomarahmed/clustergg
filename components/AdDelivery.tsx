import Icon from "@/components/Icon";
import { AUDIENCE_NOTE, MIN_COHORT, type Delivery } from "@/lib/ad-delivery";

// What a brand sees about delivery. B82.
//
// A server component with no interactivity, because every number on it is a
// count and there is nothing to filter that would not also be a count. It reads
// a `Delivery` and draws it — no arithmetic happens here at all, which is the
// point: the previous version of this panel computed a "media value" in the
// component from a headcount the server had sent it.
//
// The honesty paragraph is not a footnote and is not collapsible. A brand's
// agency will ask what a "view" means within a minute of seeing the headline,
// and the answer being right there is worth more than the space it costs.

const n = (v: number) => v.toLocaleString("en-US");

export default function AdDelivery({ delivery }: { delivery: Delivery }) {
  const d = delivery;

  if (!d.views) {
    return (
      <div className="glass p-6">
        <h3 className="text-lg font-bold">Ad views delivered</h3>
        <p className="mt-2 text-sm text-muted">{d.note}</p>
      </div>
    );
  }

  return (
    <div className="glass p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted">Ad views delivered</div>
          {/* One number. Counted. Not modelled, not weighted, not estimated. */}
          <div className="text-4xl font-black tabular-nums text-cyan-200">{n(d.views)}</div>
        </div>
        <div className="text-right text-xs text-muted">
          <div className="font-semibold text-ink">{n(d.attributedViewers)} identified gamers</div>
          <div>the rest were not signed in</div>
        </div>
      </div>

      {d.byCardKind.length > 0 && (
        <Section title="By card">
          {d.byCardKind.map((r) => <Row key={r.label} label={r.label} value={n(r.views)} />)}
        </Section>
      )}

      {d.byPlacement.length > 0 && (
        <Section title="On the website">
          {d.byPlacement.map((r) => <Row key={r.label} label={r.label} value={n(r.views)} />)}
        </Section>
      )}

      {d.byServer.length > 0 && (
        <Section title="By server">
          {d.byServer.map((r) => (
            <Row
              key={r.label}
              label={r.label}
              // Member count is CONTEXT and is labelled as context. It is never
              // multiplied by anything — see docs/legacy/AD_VIEW.md.
              note={r.members != null ? `${n(r.members)} members` : undefined}
              value={n(r.views)}
            />
          ))}
        </Section>
      )}

      <Section title="What this audience plays">
        {d.audienceSuppressed ? (
          <p className="text-xs text-amber-200">
            <Icon name="shield" size={12} className="mr-1 inline" />
            Fewer than {MIN_COHORT} identified gamers so far, so we are not reporting composition —
            a breakdown that small can identify a person.
          </p>
        ) : d.audience.length === 0 ? (
          <p className="text-xs text-muted">No linked game accounts among the gamers we could identify yet.</p>
        ) : (
          <>
            {d.audience.map((a) => (
              <Row
                key={a.game}
                label={a.game}
                // A null percentage is printed as a suppression, never as 0%.
                // "0%" would read as "nobody plays it", which is a different
                // and false claim.
                value={a.pct == null ? "—" : `${a.pct}%`}
                note={a.pct == null ? `under ${MIN_COHORT} viewers` : `${n(a.viewers)} gamers`}
              />
            ))}
            <p className="mt-3 text-[11px] leading-relaxed text-muted">{AUDIENCE_NOTE}</p>
          </>
        )}
      </Section>

      {/* Not a footnote, not collapsible. The first question an agency asks. */}
      <p className="mt-5 rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-[11px] leading-relaxed text-muted">
        {d.note}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-2 text-[10px] uppercase tracking-widest text-muted">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/6 pb-1.5 last:border-0">
      <span className="min-w-0 truncate text-sm">
        {label}
        {note && <span className="ml-2 text-[11px] text-muted">{note}</span>}
      </span>
      <span className="shrink-0 text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}
