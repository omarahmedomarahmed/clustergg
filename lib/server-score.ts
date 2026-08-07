// How a server earns a share of the weekly pool.
//
// `docs/COMMERCIAL_MODEL_V2.md` §4. This file is pure arithmetic over rows that
// have already been fetched — no queries — so the scoring can be tested against
// fixtures and argued about without a database.
//
// THE THING THIS FILE EXISTS TO PREVENT: the first version of the scoring paid
// cash for "entrants from that server" and "member growth %". Both were free or
// nearly free to fake:
//
//   * `challenge_participants` had no `guildId`, so ONE entrant counted once for
//     every server they happened to belong to. An owner mass-invites existing
//     Cluster gamers from other servers and every one of them scores for him,
//     with zero contribution and no fake accounts required. It was the cheapest
//     attack on the platform and it cost nothing.
//   * Growth % read Discord's `approximate_member_count`, which can be bought.
//     A 20-member server buying 20 members scored +100% and topped its tier for
//     about five dollars.
//
// So: every term is either DEDUPLICATED, QUALIFIED, or PER-CAPITA, and the raw
// member count scores nothing at all.

/** Each term is percentile-ranked within tier, so one outlier cannot own the pool. */
export const SCORE_WEIGHTS = {
  /** Entrants, each divided by how many participating servers they belong to. */
  exclusiveEntrants: 40,
  /** Members who cleared the qualification rule THIS WEEK. Cannot be bought. */
  newlyQualified: 25,
  /** Card opens that led to an action, per active member. Capped per gamer per day. */
  engagedOpens: 20,
  /** Entrants ÷ linked members. The genuinely size-neutral term. */
  conversion: 15,
} as const;

export type ServerWeek = {
  guildId: string;
  exclusiveEntrants: number;
  newlyQualified: number;
  engagedOpens: number;
  linked: number;
  entrants: number;
  /** Wins in the last 8 weeks, for the decay multiplier. */
  recentWins: number;
};

/**
 * Split each entrant across every participating server they belong to.
 *
 * `rows` is one row per (entrant, server) pair — the many-to-many that
 * `guildId` on the join, plus guild membership, produces. An entrant in three
 * participating servers contributes 1/3 to each.
 *
 * **The invariant: Σ over all servers ≤ the true entrant count.** It can never
 * exceed it, which is exactly what the old derived attribution did. Asserted in
 * `tests/db/attribution.mts`.
 */
export function exclusiveEntrants(rows: { userId: string; guildId: string }[]): Map<string, number> {
  const servers = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.guildId) continue; // pre-B86 rows are unattributed, not guessed
    let set = servers.get(r.userId);
    if (!set) { set = new Set(); servers.set(r.userId, set); }
    set.add(r.guildId);
  }
  const out = new Map<string, number>();
  for (const [, guilds] of servers) {
    const share = 1 / guilds.size;
    for (const g of guilds) out.set(g, (out.get(g) ?? 0) + share);
  }
  return out;
}

/**
 * Rank a value within its tier, 0–1.
 *
 * Percentile rather than the raw ratio, deliberately: one server with ten times
 * everyone's entrants would otherwise take nearly the whole pool on that term
 * alone, and the point of the pool is to make the next rung reachable.
 */
export function percentile(value: number, all: number[]): number {
  if (all.length <= 1) return 1;
  const below = all.filter((v) => v < value).length;
  const equal = all.filter((v) => v === value).length;
  return (below + (equal - 1) / 2) / (all.length - 1);
}

/**
 * A server's score for the week, 0–100, before decay.
 *
 * Every input is bounded by the percentile step, so a server cannot win by
 * doing one thing enormously — it has to be good at several.
 */
export function scoreWeek(me: ServerWeek, tier: ServerWeek[]): number {
  const p = (pick: (s: ServerWeek) => number) => percentile(pick(me), tier.map(pick));
  return Math.round((
    p((s) => s.exclusiveEntrants) * SCORE_WEIGHTS.exclusiveEntrants +
    p((s) => s.newlyQualified) * SCORE_WEIGHTS.newlyQualified +
    p((s) => s.linked > 0 ? s.engagedOpens / s.linked : 0) * SCORE_WEIGHTS.engagedOpens +
    p((s) => s.linked > 0 ? s.entrants / s.linked : 0) * SCORE_WEIGHTS.conversion
  ) * 100) / 100;
}

/**
 * Decay, not a cooldown.
 *
 * A hard "you won, sit out a week" kills the incentive to keep growing right
 * after a win and creates a predictable rotation that is itself gameable. This
 * lets a dominant server keep winning, but declining, so the server just below
 * them gets a real path in without anybody being locked out.
 */
export function decayFor(recentWins: number): number {
  return Math.max(0.5, 1 / (1 + 0.25 * Math.max(0, recentWins)));
}

/** The number slots are ranked on. */
export const finalScore = (me: ServerWeek, tier: ServerWeek[]): number =>
  Math.round(scoreWeek(me, tier) * decayFor(me.recentWins) * 100) / 100;

/**
 * Divide a pool between a flat participation share and the competition.
 *
 * **20% flat to every server that carried a challenge**, whether or not they
 * placed. Showing a pool somebody cannot reach is a taunt; a pool plus a small
 * cheque is a ladder — and the 90% who never win are the ones who decide
 * whether the bot stays installed.
 */
export const PARTICIPATION_SHARE = 20;

export type Payout = { guildId: string; amount: number; kind: "participation" | "placement" };

/**
 * Who gets paid what, out of one week's pool.
 *
 * Two rules that only show up when the network is small, and both were found by
 * walking a real week rather than by reading the design:
 *
 *   * **Under-filled slots redistribute.** With ten servers and ten slots there
 *     is no competition at all, and a preset that allocates twenty slots to a
 *     ten-server network would strand half the pool with no destination and no
 *     rule. Unclaimed placement money is shared pro-rata among the slots that
 *     were filled.
 *   * **A payout floor.** A $7.88 transfer costs more in provider fees than it
 *     delivers. Below the floor it accrues instead — the money stays in the
 *     vault and the owner is paid when it crosses.
 */
export function weekPayouts(
  pool: number,
  ranked: { guildId: string; score: number }[],
  slots: { share: number }[],
  opts: { participationShare?: number; floor?: number } = {},
): { payouts: Payout[]; carried: number } {
  const partPct = opts.participationShare ?? PARTICIPATION_SHARE;
  const floor = opts.floor ?? 25;
  const participants = ranked.length;
  const payouts: Payout[] = [];

  const partPool = pool * (partPct / 100);
  if (participants > 0) {
    const each = partPool / participants;
    for (const r of ranked) payouts.push({ guildId: r.guildId, amount: each, kind: "participation" });
  }

  // Placement. A slot with nobody in it does not disappear — its share is
  // redistributed across the slots that were filled.
  const compPool = pool - (participants > 0 ? partPool : 0);
  const filled = Math.min(slots.length, participants);
  if (filled > 0) {
    const usedShare = slots.slice(0, filled).reduce((a, s) => a + s.share, 0);
    const top = [...ranked].sort((a, b) => b.score - a.score).slice(0, filled);
    top.forEach((r, i) => {
      const share = usedShare > 0 ? slots[i].share / usedShare : 1 / filled;
      payouts.push({ guildId: r.guildId, amount: compPool * share, kind: "placement" });
    });
  }

  // Merge per guild, then hold anything under the floor.
  const byGuild = new Map<string, number>();
  for (const p of payouts) byGuild.set(p.guildId, (byGuild.get(p.guildId) ?? 0) + p.amount);

  const out: Payout[] = [];
  let carried = 0;
  for (const [guildId, amount] of byGuild) {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded < floor) { carried += rounded; continue; }
    out.push({ guildId, amount: rounded, kind: "placement" });
  }
  return { payouts: out, carried: Math.round(carried * 100) / 100 };
}
