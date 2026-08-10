import Icon from "@/components/Icon";
import { money } from "@/lib/pricing";
import type { BrandStanding } from "@/lib/brand-report";

// Where a brand stands, at the top of their own dashboard.
//
// Every ads manager opens on the same question — am I winning — so this answers
// it in one line before offering anything to buy. What is shown is derived from
// the campaigns actually running rather than from a plan they signed, which
// means the line can never disagree with the list underneath it.
//
// ===== IT USED TO SAY "REACH TIER" =====
//
// The badge was named after the three plans on the old rate card. There is one
// package now, so the word named a product a brand could not have bought and
// promised a ladder they could not climb. B118 replaced the tier with the
// measurement that was underneath it all along: how many of the games we
// commercialise this brand carries.
//
// The progress bar is the only sales pressure on the page, and it is honest
// pressure: it counts games, and the way to move is to sponsor another one.

export default function BrandTierStrip({
  standing, membersInServers, entrants, spend, pastGames = 0, currency = "USD",
}: {
  standing: BrandStanding;
  spend: number;
  /**
   * The member headcount of the servers this brand's challenges posted into.
   *
   * Was named `reached` and labelled "People reached" — the same false claim as
   * the deleted ROAS figure, in a third place nobody had checked. Renamed at the
   * prop as well as the label, because a prop called `reached` invites the wrong
   * label back the next time somebody touches this file.
   */
  membersInServers: number;
  entrants: number;
  /** Games they have run a month on before, whether or not one is live now. */
  pastGames?: number;
  currency?: string;
}) {
  const pct = standing.next
    ? Math.min(100, Math.round((standing.games / standing.next.games) * 100))
    : 100;

  // A brand that has run campaigns but has none live right now is BETWEEN
  // them, not back at the bottom. Showing "No game running" above a month of
  // results would read as a demotion for finishing what they bought.
  const between = standing.games === 0 && pastGames > 0;

  const blurb = standing.games <= 0
    ? "Your creative runs on every card the bot posts. Sponsor a game and you get the competition itself."
    : standing.games >= standing.ofGames
      ? "Every game we commercialise carries your brand. There is nothing above this."
      : "You're running challenges — your brand is the reason people are playing this week.";

  return (
    <section className="glass overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
              between ? "border-amber-400/45 bg-amber-500/12 text-amber-200" : "border-cyan-400/45 bg-cyan-500/12 text-cyan-200"
            }`}>
              {between ? "Between campaigns" : standing.label}
            </span>
            {standing.games > 0 && (
              <span className="text-xs text-muted tabular-nums">
                {money(standing.monthly, currency)} a month
              </span>
            )}
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted">
            {between
              ? "Your last month has finished and nothing is running right now. Buy the next one below — the same game, or a new one."
              : blurb}
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-2 text-right">
          <Figure label="Invested" value={money(spend, currency)} />
          <Figure label="Members in those servers" value={membersInServers.toLocaleString()} />
          <Figure label="Competed" value={entrants.toLocaleString()} />
        </div>
      </div>

      {standing.next && (
        <div className="border-t border-white/10 bg-black/25 px-5 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              <Icon name="rocket" size={12} className="text-cyan-300" />
              One more game and you carry <b className="text-ink">{standing.next.label}</b>.
            </span>
            <span className="tabular-nums text-muted">{standing.games}/{standing.ofGames}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-cyan-400/70" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/12 bg-black/25 px-3 py-2">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
    </div>
  );
}
