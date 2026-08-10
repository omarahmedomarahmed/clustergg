// Every rule, to the person it binds, with the reason it exists. B90.10.
//
// ===== WHY A REGISTRY AND NOT THREE PAGES OF PROSE =====
//
// Every number in here is IMPORTED from the code that enforces it. A guide that
// quotes "$25 minimum withdrawal" while the code refuses below $20 is not a
// documentation bug — it is a promise we are held to, and the person who finds
// the gap is the one it cost money. Writing the rules as data with the
// constants inlined means the guide cannot drift: change the floor and the
// sentence changes with it.
//
// ===== EVERY RULE CARRIES ITS REASON, IN THEIR TERMS =====
//
// Not "so we can measure" — that is a reason for US. A rule with no reason
// reads as an obstacle and gets worked around; a rule whose reason is about us
// reads as an obstacle we benefit from. The daily CP ceiling is not "a limit we
// impose", it is "the reason the points are still worth something in six
// months". The 30-day first-payout hold is not "we distrust you", it is "the
// only mechanism that can claw back a fraud, which is why anybody can be paid
// at all".
//
// ===== A DRAFTING NOTE THAT IS NOT OPTIONAL =====
//
// Every line in here is a promise. A guide that OVERSTATES a rule is a term we
// are held to — the same reason C3 deleted the tier percentage. When in doubt,
// say less and say it exactly.

import { PARTICIPATION_SHARE } from "@/lib/server-score";
import { RUNGS, EARN_FLOOR } from "@/lib/ladder";
import { UNLOCK_STEPS } from "@/lib/unlock";
import { MIN_WITHDRAWAL } from "@/lib/server-wallet";
import { PRIVATE_FEE_PCT, MIN_PRIZE_POOL, PRIZE_POOL_STEP } from "@/lib/private-quote";
import { US_REPORT_THRESHOLD } from "@/lib/eligibility";
import { MAX_PLACES } from "@/lib/prize-places";

export type Audience = "gamer" | "owner" | "brand";

export type Rule = {
  /** What the rule is, in one line. */
  rule: string;
  /** Why it exists, in terms of what it gets THEM. Never "so we can measure". */
  why: string;
  /** Which part of the product it belongs to, for grouping. */
  topic: string;
};

export const AUDIENCES: Record<Audience, { label: string; lede: string }> = {
  gamer: {
    label: "If you play",
    lede: "Everything that decides what you earn, what you can win, and what you can cash out. "
      + "Every rule here has a reason, and the reason is on the same line.",
  },
  owner: {
    label: "If you run a server",
    lede: "How the weekly pool decides what your community is worth, what counts toward it, "
      + "and what you can do with what you earn.",
  },
  brand: {
    label: "If you buy",
    lede: "What you are buying, what half of it pays for, and what we will and will not promise you.",
  },
};

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export const RULES: Record<Audience, Rule[]> = {
  gamer: [
    {
      topic: "Getting started",
      rule: "Tell us which country you are in before you can earn.",
      why: "It decides whether a trophy can be turned into money where you live. Finding that out "
        + "when you try to cash one is the worst possible moment — this way you know before you win.",
    },
    {
      topic: "Getting started",
      rule: `Nothing counts until all ${UNLOCK_STEPS} setup steps are done — no points, no trophies, no challenge entries.`,
      why: "We will not promise you a balance before we know whether we are allowed to pay you. "
        + "Anything you earned before we started asking is safe and untouched, and finishing "
        + "takes about a minute.",
    },
    {
      topic: "Playing",
      rule: "A challenge is joinable as soon as it is announced, but nothing you play counts until it starts.",
      why: "You can enter early without racing early. Everybody is measured from the same moment, "
        + "so somebody who joined on announcement day has no head start on you.",
    },
    {
      topic: "Playing",
      rule: "One account per challenge, and it has to be a game account you have proved is yours.",
      why: "It is the only thing that stops one person entering five times and taking a prize "
        + "you were second to.",
    },
    {
      topic: "Playing",
      rule: `A challenge pays up to ${MAX_PLACES} places, and the ones that pay are shown before you enter.`,
      why: "You should know whether coming fourth is worth anything before you spend a week on it.",
    },
    {
      topic: "Points",
      rule: "There is a ceiling on how many points anyone can earn in a day.",
      why: "It is the reason the points are still worth something in six months. Without it, the "
        + "people who grind hardest devalue what everybody else has already earned.",
    },
    {
      topic: "Winning",
      rule: "A trophy is yours permanently and appears on your profile. Turning it into money is a separate step.",
      why: "The trophy is the thing you keep. Cashing out is optional, and it opens at 18 because "
        + "that is the age at which we are allowed to pay somebody.",
    },
    {
      topic: "Winning",
      rule: `If you are in the United States and we pay you more than ${money(US_REPORT_THRESHOLD)} in a year, we have to report it.`,
      why: "Said here rather than in a surprise form at the moment you try to collect.",
    },
  ],

  owner: [
    {
      topic: "The pool",
      rule: "Every week, the servers that carried a public challenge share a pool.",
      why: "It is a share of what brands actually paid that week, not a rate we invented and can "
        + "quietly change.",
    },
    {
      topic: "The pool",
      rule: `${PARTICIPATION_SHARE}% of the pool is split evenly between everybody who carried a challenge, placed or not.`,
      why: "Turning up is worth something. A pool that only pays the top three is one most servers "
        + "would be right to ignore.",
    },
    {
      topic: "The pool",
      rule: `Servers compete inside a rung — ${RUNGS.map((b) => `${b.label} takes ${b.share}%`).join(", ")}.`,
      why: "A bracket is who you are compared against and nothing else. It means four large servers "
        + "can never take the share set aside for small ones.",
    },
    {
      topic: "What counts",
      rule: "Your score is about how many of YOUR members entered, not how many members you have.",
      why: "A small server with a community that actually turns up beats a large one that does not. "
        + "It is the term you can move.",
    },
    {
      topic: "What counts",
      rule: "An entrant who is in five servers counts a fifth for each of them.",
      why: "Mass-inviting other servers' gamers scores you almost nothing, so nobody has to play "
        + "that game to keep up.",
    },
    {
      topic: "What counts",
      rule: "A private challenge you bought does not count toward the pool. The members it brought in do.",
      why: "A private challenge grows you, it does not pay you twice. Linking is linking whatever "
        + "brought somebody in — so it still raises your score the ordinary way.",
    },
    {
      topic: "Your money",
      rule: `The smallest withdrawal is ${money(MIN_WITHDRAWAL)}.`,
      why: "A transfer smaller than that spends most of itself in fees. Below it, the money keeps "
        + "sitting in your wallet, where it is still yours and still spendable.",
    },
    {
      topic: "Your money",
      rule: "Your first payout is held for 30 days.",
      why: "It is the only mechanism that can claw back a fraud, which is why anybody can be paid at "
        + "all. After the first one, weekly.",
    },
    {
      topic: "Your money",
      rule: "Money you have asked to withdraw stops being spendable the moment you ask.",
      why: "So it can never go out twice — once to your bank and once on a challenge.",
    },
    {
      topic: "Your own challenges",
      rule: `You can buy a challenge for your own members: the prize pool plus ${PRIVATE_FEE_PCT}%, from ${money(MIN_PRIZE_POOL)} in prizes and in ${money(PRIZE_POOL_STEP)} steps.`,
      why: "The margin is what makes it something we sell you rather than us moving your money "
        + "around — and that is what lets us owe your members the prize directly.",
    },
    {
      topic: "Your own challenges",
      rule: "We set the scoring and write the rules on anything you buy, before it goes out.",
      why: "A competition nobody can score is one your members will finish angry. It is the part we "
        + "are good at.",
    },
  ],

  brand: [
    {
      topic: "What you buy",
      rule: "A campaign is 1 to 4 consecutive weekly challenges. Beyond that, we build it with you.",
      why: "Four weeks is a month, which is how a media buy is planned. Anything longer is a deal "
        + "worth a conversation rather than a checkout.",
    },
    {
      topic: "What you buy",
      rule: "Half of what you pay is prize money that goes to gamers.",
      why: "You are not renting attention, you are paying people to play — inside the servers they "
        + "already live in. It is why the challenges get entered.",
    },
    {
      topic: "What you buy",
      rule: "Reach figures are an estimate, and what you are billed against is what actually landed.",
      why: "The estimate is what we think will happen. The delivery ledger is what did, and it is "
        + "the one on the report.",
    },
    {
      topic: "Before it runs",
      rule: "Nothing is announced to a single server until the invoice clears.",
      why: "It protects you as much as us: an announcement is a promise to a community, and one we "
        + "have to unwind is a community that trusts the next one less.",
    },
    {
      topic: "Before it runs",
      rule: "You choose which of your trophies goes out. We will tell you if we cannot use one.",
      why: "A trophy stays on the winner's profile permanently, so which design it is matters. If a "
        + "design has been retired we come back to you rather than substituting quietly.",
    },
    {
      topic: "What we will not do",
      rule: "You never see another brand's numbers.",
      why: "Which is exactly why they never see yours. What you get instead are platform-wide "
        + "benchmarks with nobody named.",
    },
    {
      topic: "What we will not do",
      rule: "We do not profile under-18s for advertising.",
      why: "Contextual only. It is the law in nine places we operate and the right answer in the "
        + "rest, and it is not something we would trade for a better click-through.",
    },
  ],
};

/** Rules grouped by topic, in the order they were written. */
export function rulesByTopic(audience: Audience): { topic: string; rules: Rule[] }[] {
  const out: { topic: string; rules: Rule[] }[] = [];
  for (const r of RULES[audience]) {
    const last = out[out.length - 1];
    if (last && last.topic === r.topic) last.rules.push(r);
    else out.push({ topic: r.topic, rules: [r] });
  }
  return out;
}
