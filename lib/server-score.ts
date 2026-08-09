// How a server earns a share of the weekly pool.
//
// `docs/MODEL.md` §4. This file is pure arithmetic over rows that
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

/**
 * Each term is percentile-ranked within its bracket, so one outlier cannot own
 * the pool.
 *
 * ===== `engagedOpens` IS GONE. B73, Discord Developer Policy §13 =====
 *
 * "Do not misrepresent or fraudulently manipulate engagement … This also
 * includes automating messages to be sent for the purpose of maintaining
 * activity in a Discord server."
 *
 * A weekly cash pool scored on how many cards a server's members OPENED is a
 * standing financial incentive to manufacture Discord activity. It does not
 * matter that our own count was per-capita and daily-capped: the thing being
 * paid for was attention inside somebody else's product, and that is the clause
 * word for word.
 *
 * The three terms that remain all measure an OUTCOME rather than activity —
 * somebody entered a competition, somebody linked a game account, and how
 * efficiently a server turns the second into the first. A server owner cannot
 * inflate any of them by posting more.
 *
 * ===== WHERE THE 20 POINTS WENT, AND WHY NOT IN PROPORTION =====
 *
 * Redistributing proportionally was the obvious move and it was wrong. It put
 * `exclusiveEntrants` — a RAW COUNT, and the one term that rewards being big —
 * at half the score, and a test caught the consequence immediately: a 10-member
 * server with 8 entrants tied with a 500-member server with 10. The small one
 * had eight times the conversion and nine times the growth and still could not
 * win.
 *
 * Deleting a term must not quietly change who the system favours. So the 20
 * points went to the two SIZE-NEUTRAL terms instead, and `exclusiveEntrants`
 * stayed where it was. A small server that converts its members now beats a
 * large one that does not, which is the outcome the bracket split exists to
 * protect and which proportional redistribution would have undone.
 */
export const SCORE_WEIGHTS = {
  /** Entrants, each divided by how many participating servers they belong to. */
  exclusiveEntrants: 40,
  /** Members who cleared the qualification rule THIS WEEK. Cannot be bought. */
  newlyQualified: 30,
  /** Entrants ÷ linked members. The genuinely size-neutral term. */
  conversion: 30,
} as const;

export type ServerWeek = {
  guildId: string;
  exclusiveEntrants: number;
  newlyQualified: number;
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
    p((s) => s.linked > 0 ? s.entrants / s.linked : 0) * SCORE_WEIGHTS.conversion
  ) * 100) / 100;
}

/**
 * ===== SIZE BRACKETS =====
 *
 * The pool is split by bracket BEFORE anything is scored, and that split is the
 * answer to the only fairness question owners actually ask: can four big servers
 * take everything?
 *
 * They cannot. A large server competes for the large bracket's share and can
 * never reach the small one's. Fixed per-server percentages could never do this
 * — 20 small servers at 5% is 100%, 21 is 105%, and four large servers at 25% is
 * the whole pool with nothing left for anybody else. Percentages only add up
 * when they are computed, not assigned.
 *
 * An EMPTY bracket gives its share to the others, pro-rata. Money set aside for
 * servers that did not turn up is money nobody can be paid, and holding it back
 * would shrink a pool that was already announced.
 */
export const BRACKETS = [
  { key: "small", label: "Small", floor: 0, share: 60 },
  { key: "mid", label: "Mid", floor: 500, share: 25 },
  { key: "large", label: "Large", floor: 1000, share: 15 },
] as const;
export type BracketKey = (typeof BRACKETS)[number]["key"];

/** Which bracket a server competes in, by qualified linked members. */
export function bracketOf(qualifiedLinked: number): BracketKey {
  let k: BracketKey = "small";
  for (const b of BRACKETS) if (qualifiedLinked >= b.floor) k = b.key;
  return k;
}

/**
 * **20% flat to every server that took part**, whether or not they placed.
 *
 * Showing a pool somebody cannot reach is a taunt; a pool plus a small cheque is
 * a ladder — and the 90% who never come first are the ones who decide whether
 * the bot stays installed.
 */
export const PARTICIPATION_SHARE = 20;

export type Payout = { guildId: string; amount: number; kind: "participation" | "placement" };

/**
 * Who gets paid what, out of one week's pool.
 *
 * ===== ONE SENTENCE: YOUR SHARE OF THE POOL IS YOUR SHARE OF THE SCORE =====
 *
 * Within a bracket, after the flat participation share, a server takes the
 * fraction of the competitive money that matches its fraction of the total
 * score. 120 points out of 1,000 is 12%.
 *
 * ===== WHAT THIS REPLACED, AND WHY =====
 *
 * Slots (`top 20%`, share ∝ 1/(rank+1)), repeat-winner decay, and empty-slot
 * redistribution. Three mechanisms, each with its own edge cases, none of which
 * an owner could work out from their own numbers.
 *
 *   * SLOTS created a cliff at #21 — the difference between 20th and 21st was
 *     the difference between a cheque and nothing, for one entrant.
 *   * DECAY punished a server for winning, which is the opposite of what a
 *     network wants from its best server.
 *   * REDISTRIBUTION existed only to patch the first.
 *
 * Score-proportional needs none of them: every qualifying server is paid, there
 * is no cliff to fall off, and there is nothing left over to redistribute.
 *
 * **A payout floor survives.** A $7.88 transfer costs more in provider fees than
 * it delivers, so below the floor it accrues and the owner is paid when it
 * crosses. That is the one piece of the old design that was about reality
 * rather than about the ranking.
 */
export function weekPayouts(
  pool: number,
  ranked: { guildId: string; score: number; bracket?: BracketKey }[],
  opts: { participationShare?: number; floor?: number } = {},
): { payouts: Payout[]; carried: number } {
  const partPct = opts.participationShare ?? PARTICIPATION_SHARE;
  const floor = opts.floor ?? 25;
  const payouts: Payout[] = [];
  if (!ranked.length || !(pool > 0)) return { payouts: [], carried: 0 };

  // ===== Split the pool by bracket, then give empty brackets away =====
  const present = new Set(ranked.map((r) => r.bracket ?? "small"));
  const liveShare = BRACKETS.filter((b) => present.has(b.key)).reduce((a, b) => a + b.share, 0);
  const poolOf = (k: BracketKey) => {
    if (!liveShare) return 0;
    const b = BRACKETS.find((x) => x.key === k)!;
    // Normalised against only the brackets that turned up, so an empty one's
    // share flows to the others rather than stranding money with no destination.
    return pool * (b.share / liveShare);
  };

  for (const b of BRACKETS) {
    if (!present.has(b.key)) continue;
    const inBracket = ranked.filter((r) => (r.bracket ?? "small") === b.key);
    const bracketPool = poolOf(b.key);

    // Flat, to everyone who took part.
    const partPool = bracketPool * (partPct / 100);
    const each = partPool / inBracket.length;
    for (const r of inBracket) payouts.push({ guildId: r.guildId, amount: each, kind: "participation" });

    // Competitive, in proportion to score.
    const compPool = bracketPool - partPool;
    const total = inBracket.reduce((a, r) => a + Math.max(0, r.score), 0);
    if (total > 0) {
      for (const r of inBracket) {
        const share = Math.max(0, r.score) / total;
        if (share > 0) payouts.push({ guildId: r.guildId, amount: compPool * share, kind: "placement" });
      }
    } else {
      // Nobody scored. The competitive money joins the flat share rather than
      // vanishing — it was announced as this week's pool and it is owed to the
      // servers that turned up.
      const extra = compPool / inBracket.length;
      for (const r of inBracket) payouts.push({ guildId: r.guildId, amount: extra, kind: "participation" });
    }
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
