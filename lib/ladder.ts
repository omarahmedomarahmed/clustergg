// THE LADDER. One list. M3.
//
// ===== WHAT THIS REPLACED =====
//
// Four lists of server sizes lived in four files and did not agree with each
// other:
//
//   lib/server-earnings.ts  EARN_TIERS   0 / 500 / 1,000 / 5,000
//   lib/server-portal.ts    TIERS        0 / 500 / 1,000 / 5,000  (+ labels)
//   lib/week-tiers.ts       TIERS        0 / 500 / 5,000
//   lib/server-score.ts     BRACKETS     0 / 500 / 1,000          (+ pool shares)
//
// The last two are the ones that mattered, because one of them was a label and
// the other decided money — and they disagreed about the top rung by a factor
// of five. A server with 2,000 qualified members was shown "Broadcaster",
// competed in the LARGE bracket for 15% of the pool, and was called "mid" by
// the weekly close. Three answers to one question.
//
// They are now one array. A rung is a LABEL, a BRACKET and a GATE at once,
// because they were only ever three readings of the same number: how many of
// this server's members have linked a game account.
//
// ===== WHY THE NUMBERS CAME DOWN TO 10 / 50 / 100 =====
//
// The old bottom rung was 0 and the first meaningful one was 500. Almost every
// Discord server in the world is smaller than 500 members, let alone 500 LINKED
// members, so the ladder was addressed to servers that mostly do not exist. A
// bar at 500 is not ambitious, it is a closed door with a number painted on it.
//
// Fifty servers with ten linked members each is a better network than one server
// with five hundred: the ten are people who turned up, and the five hundred
// include everyone who joined for one thing in 2021 and never came back. Small
// servers also convert better — the owner knows the members by name.
//
//   RUNG 1   10 linked    starts earning
//   RUNG 2   50 linked    a bigger share, per server
//   RUNG 3  100 linked    the biggest share, per server
//
// ===== RUNG 1 IS A GATE, AND THAT IS NEW =====
//
// The bottom rung used to be 0, which is not a rung. Every consequence attached
// to "reaching a tier" therefore fired on the first linked member: the
// payout-holding clock in `lib/discord/guilds.ts` computed
// `Math.min(...EARN_TIERS.map(t => t.threshold))`, got 0, and started for
// everybody. A gate everybody is already through is not a gate.
//
// At 10, `EARN_FLOOR` means something: below it a server is not scored and not
// paid, so the flat participation share is divided between servers that
// actually brought somebody, rather than diluted by every guild the bot happens
// to sit in.
//
// ===== "A HIGHER PERCENTAGE" IS REAL, AND IT IS NOT A PER-SERVER RATE =====
//
// It cannot be a rate. Twenty servers at 5% of a challenge is 100% of it,
// twenty-one is 105%, and four servers at 25% is the entire thing with nothing
// left for anybody else. Assigned percentages only add up by accident;
// computed ones always add up.
//
// So the pool is split across the three rungs FIRST — 60 / 25 / 15 — and each
// rung is competed for only by the servers in it. That is where the higher
// percentage lives, and it is higher where it counts, PER SERVER: rung 3 holds
// a small number of servers dividing 15%, while rung 1 holds most of the
// network dividing 60%. Climbing moves you into a smaller room with a smaller
// pot, and the pot per head goes up.
//
// It also answers the only fairness question owners actually ask — can the big
// servers take everything? They cannot reach rung 1's 60% at all.
//
// An EMPTY rung gives its share to the others, pro-rata. Money set aside for
// servers that did not turn up is money nobody can be paid, and holding it back
// would shrink a pool that has already been announced.

export type RungKey = "linked" | "growing" | "established";

export type Rung = {
  key: RungKey;
  /** Qualified linked members required. Linked — not members, not joins. */
  threshold: number;
  /** This rung's slice of the weekly server pool, as a %. The three total 100. */
  share: number;

  // ===== Identity =====
  //
  // A rung is the thing an owner tells other owners about, so each one is a
  // label with its own colour and its own rank — not three rows sharing a gold
  // icon. There is deliberately no rate on it: see above.

  /** Short label, for a table cell or a chart axis. */
  label: string;
  /** Full name, for the badge. */
  name: string;
  rank: string;
  /** Icon name from components/Icon — never an emoji; the site renders SVG. */
  icon: string;
  tone: string;
  /** One line: what you are once you are here. */
  blurb: string;
  unlocks: string;
  detail: string;
};

export const RUNGS: Rung[] = [
  {
    key: "linked",
    threshold: 10,
    share: 60,
    label: "Linked",
    name: "Linked Server",
    rank: "Rung 1",
    icon: "spark",
    tone: "#94a3b8",
    blurb: "You are earning.",
    unlocks: "A share of every week's pool",
    detail:
      "Ten of your members have linked a game account, which is all it takes to start. Your server is scored "
      + "every week against other servers this size, and every server that carried a challenge is paid something "
      + "whether it placed or not.",
  },
  {
    key: "growing",
    threshold: 50,
    share: 25,
    label: "Growing",
    name: "Growing Server",
    rank: "Rung 2",
    icon: "diamond",
    tone: "#22d3ee",
    blurb: "A bigger slice, split fewer ways.",
    unlocks: "Rung 2's share of the pool, contested by fewer servers",
    detail:
      "Fifty linked members moves you out of the largest rung and into a smaller one. The pot is smaller and so "
      + "is the number of servers dividing it, which is what makes the share per server go up.",
  },
  {
    key: "established",
    threshold: 100,
    share: 15,
    label: "Established",
    name: "Established Server",
    rank: "Rung 3",
    icon: "crown",
    tone: "#fbbf24",
    blurb: "The top of the ladder.",
    unlocks: "The highest share per server, and brands asking for you by name",
    detail:
      "A hundred linked members is a community brands want named in the brief. You compete in the smallest rung "
      + "for its own slice of every week's pool, and challenges are pointed at your server first.",
  },
];

/**
 * The lowest number of qualified linked members that earns anything.
 *
 * Read it, never retype it. Every surface that states the bar — the bot, the
 * portal, the rules pages, the marketing copy — imports this so there is one
 * number to change and no page that can quietly keep the old one.
 */
export const EARN_FLOOR = RUNGS[0].threshold;

/** Whether a server is on the ladder at all. Below the floor: not scored, not paid. */
export const earning = (qualifiedLinked: number): boolean => qualifiedLinked >= EARN_FLOOR;

/**
 * Which rung a server stands on.
 *
 * Returns `null` below the floor rather than clamping to rung 1. Clamping is
 * what made the old bottom tier meaningless: a server with one linked member
 * was "seed", which read as a rung and behaved as a rung and paid like a rung.
 * A caller that wants a label for an off-ladder server has to say so.
 */
export function rungOf(qualifiedLinked: number): RungKey | null {
  if (!earning(qualifiedLinked)) return null;
  let k: RungKey = RUNGS[0].key;
  for (const r of RUNGS) if (qualifiedLinked >= r.threshold) k = r.key;
  return k;
}

/** The rung's own row, or null off the ladder. */
export const rung = (qualifiedLinked: number): Rung | null => {
  const k = rungOf(qualifiedLinked);
  return k ? RUNGS.find((r) => r.key === k)! : null;
};

/**
 * What a server that is NOT on the ladder is shown.
 *
 * `rungOf` returns null below the floor on purpose — the arithmetic must not
 * quietly treat an off-ladder server as rung 1. But a page still has to render
 * something, and rendering nothing is how "not earning" turns into a blank
 * space an owner reads as a bug. So there is exactly one off-ladder card, it
 * says what the bar is, and it is a lock rather than a badge.
 */
export const OFF_LADDER = {
  key: null,
  label: "Not yet",
  name: "Not earning yet",
  rank: "Off the ladder",
  icon: "lock",
  tone: "#64748b",
  blurb: `${EARN_FLOOR} linked members starts it.`,
} as const;

/** The badge for any server, on the ladder or not. Never null, so no caller has to branch. */
export const ladderBadge = (
  qualifiedLinked: number,
): { name: string; rank: string; icon: string; tone: string; blurb: string } =>
  rung(qualifiedLinked) ?? OFF_LADDER;

/** The next rung up, and what it takes. Null at the top. */
export const nextRung = (qualifiedLinked: number): Rung | null =>
  RUNGS.find((r) => r.threshold > qualifiedLinked) ?? null;

/**
 * Where a server is between the rung it is on and the next one, 0–100.
 *
 * Off the ladder, the bar measures progress toward the floor — which is the one
 * number a brand-new server cares about.
 *
 * Floored, not rounded: at 49 of 50 this must not read "100%". Telling an owner
 * they have arrived when they have not is the one error this bar can make.
 */
export function ladderProgress(qualifiedLinked: number): { current: Rung | null; next: Rung | null; pct: number } {
  const current = rung(qualifiedLinked);
  const next = nextRung(qualifiedLinked);
  const from = current?.threshold ?? 0;
  const span = next ? next.threshold - from : 1;
  const done = next ? qualifiedLinked - from : span;
  return { current, next, pct: Math.max(0, Math.min(100, Math.floor((done / span) * 100))) };
}
