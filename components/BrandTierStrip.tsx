import Icon from "@/components/Icon";
import { money } from "@/lib/pricing";
import type { BrandTier } from "@/lib/brand-report";

// Where a brand stands, at the top of their own dashboard.
//
// Every ads manager opens on the same question — am I winning — so this answers
// it in one line before offering anything to buy. The tier is derived from what
// they actually run rather than from a plan they signed, which means the badge
// can never disagree with the campaigns listed underneath it.
//
// The progress bar to the next tier is the only sales pressure on the page, and
// it's honest pressure: it counts games, and the way to move is to sponsor
// another one.

const BLURB: Record<string, string> = {
  reach: "Your creative runs on every card the bot posts. Sponsor a game and you get the competition itself.",
  challenge: "You're running challenges — your brand is the reason people are playing this week.",
  ultimate: "Every game we commercialise carries your brand. There is nothing above this.",
};

export default function BrandTierStrip({
  tier, membersInServers, entrants, spend, pastGames = 0, currency = "USD",
}: {
  tier: BrandTier;
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
  const pct = tier.next
    ? Math.min(100, Math.round((tier.games / tier.next.games) * 100))
    : 100;

  // A brand that has run campaigns but has none live right now is BETWEEN
  // them, not back at the bottom. Showing "Reach tier" above a month of
  // results would read as a demotion for finishing what they bought.
  const between = tier.games === 0 && pastGames > 0;

  return (
    <section className="glass overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
              between ? "border-amber-400/45 bg-amber-500/12 text-amber-200" : "border-cyan-400/45 bg-cyan-500/12 text-cyan-200"
            }`}>
              {between ? "Between campaigns" : `${tier.label} tier`}
            </span>
            {(tier.games > 0 || between) && (
              <span className="text-xs text-muted tabular-nums">
                {tier.games || pastGames} of {tier.ofGames} games sponsored
              </span>
            )}
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted">
            {between
              ? "Your last month has finished and nothing is running right now. Buy the next one below — the same game, or a new one."
              : BLURB[tier.key]}
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-2 text-right">
          <Figure label="Invested" value={money(spend, currency)} />
          <Figure label="Members in those servers" value={membersInServers.toLocaleString()} />
          <Figure label="Competed" value={entrants.toLocaleString()} />
        </div>
      </div>

      {tier.next && (
        <div className="border-t border-white/10 bg-black/25 px-5 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              <Icon name="rocket" size={12} className="text-cyan-300" />
              {tier.next.games - tier.games === 1
                ? <>One more game and you&apos;re on <b className="text-ink">{tier.next.label}</b>.</>
                : <>{tier.next.games - tier.games} more games and you&apos;re on <b className="text-ink">{tier.next.label}</b>.</>}
            </span>
            <span className="tabular-nums text-muted">{tier.games}/{tier.next.games}</span>
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
