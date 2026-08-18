// The published rules, per audience. 04 §1 `/rules/[who]`.
//
// ===== THIS FILE IS THE HARDEST PLACE TO KEEP HOUSE RULE 2 =====
//
// A rules page is prose about numbers, which is exactly the shape that
// produced this whole branch: *a document quoting an owner's withdrawal floor
// at twice its real value.* It was not lying — it was a copy of a number that
// had moved, and nothing connected the two.
//
// So **every rule below is a function**, and every figure in it comes from the
// module that enforces it. There is not one literal price, share, threshold,
// tier or period in this file, and `03-copy` fails the band if one appears.
// C2 — a document that quotes a rate is a rate we are held to by whoever read
// it.

import {
  CHALLENGE_PRICE_CENTS,
  COMMUNITY_TIERS,
  TROPHY_HOLD_YEARS,
  MIN_AUDIENCE_GROUP,
  KPI_WEIGHTS,
  splitOf,
  formatMoney,
} from "../money/amounts.ts";
import { LINKED_MEMBERS_TO_UNLOCK_POOL, SERVER_PROFILE_FIELDS } from "../pool/eligibility.ts";
import { DEFAULT_METRIC_WEIGHTS } from "../challenges/scoring.ts";

export const RULE_AUDIENCES = ["gamer", "owner", "brand"] as const;
export type RuleAudience = (typeof RULE_AUDIENCES)[number];

export const AUDIENCE_LABEL: Record<RuleAudience, string> = {
  gamer: "Rules for gamers",
  owner: "Rules for server owners",
  brand: "Rules for brands",
};

export type Rule = { heading: string; body: string };

export function isRuleAudience(who: string): who is RuleAudience {
  return (RULE_AUDIENCES as readonly string[]).includes(who);
}

function gamerRules(): Rule[] {
  const split = splitOf(CHALLENGE_PRICE_CENTS);
  return [
    {
      heading: "How a week works",
      body:
        "A challenge runs Monday 00:00 UTC to Friday 00:00 UTC. You can join right up " +
        "to the final second, and you still get a trophy for turning up.",
    },
    {
      heading: "How you score",
      body:
        `Points are (wins × ${DEFAULT_METRIC_WEIGHTS.wins}) + ` +
        `(matches × ${DEFAULT_METRIC_WEIGHTS.matches}), counted ` +
        "from the moment you joined. No win rate, no percentages, no ratios. It rewards " +
        "volume on purpose — grinding is a legitimate way to win a week.",
    },
    {
      heading: "When your scoring starts",
      body:
        "From whichever is later: the start of the week, or the moment you joined. " +
        "Join before Monday and nothing you played beforehand counts. Join on day two " +
        "and days one and two do not count either. Two challenges on one game account " +
        "keep two independent baselines and never interfere.",
    },
    {
      heading: "Trophies",
      body:
        `Place, and your trophy is worth money. Turn up and it is a branded ` +
        `collectable — it was never worth money and nothing is missing from it. ` +
        `We hold every trophy for ${TROPHY_HOLD_YEARS} years, so one won at 13 is ` +
        `still there at 18.`,
    },
    {
      heading: "Cashing out",
      body:
        "You must be 18 or over, in a country we can pay, with a verified email. Under " +
        "18, the trophy keeps — contact support when you turn 18. A trophy worth " +
        "nothing cannot be cashed out, and the button will tell you so rather than " +
        "quietly disappearing.",
    },
    {
      heading: "One game account, one gamer",
      body:
        "A game account belongs to exactly one Cluster account. If somebody claimed " +
        "yours without proving it and you can prove it, it becomes yours.",
    },
    {
      heading: "What the prize money is",
      body:
        `${formatMoney(split.prize)} of every ${formatMoney(CHALLENGE_PRICE_CENTS)} ` +
        "challenge is prize money, and it sits in a vault before a single trophy is " +
        "awarded. Every trophy worth money is backed by money already received.",
    },
  ];
}

function ownerRules(): Rule[] {
  const split = splitOf(CHALLENGE_PRICE_CENTS);
  return [
    {
      heading: "What your server earns",
      body:
        `${formatMoney(split.server)} of every ${formatMoney(CHALLENGE_PRICE_CENTS)} ` +
        "challenge goes to the server vault, and a deliberate slice of that vault is " +
        "allocated to each week's pool. Nothing allocates itself.",
    },
    {
      heading: "Getting into the pool",
      body:
        `Two things: at least ${LINKED_MEMBERS_TO_UNLOCK_POOL} linked gamers whose ` +
        `parent server is yours, and all ${SERVER_PROFILE_FIELDS.length} profile ` +
        "fields answered. Both are checked once, when Monday's gun fires, and never " +
        "re-checked mid-week. What the pool page shows on Wednesday is what pays on " +
        "Friday.",
    },
    {
      heading: "How the pool divides",
      body:
        `Part of it is split evenly among every server that carried an entrant — ` +
        `turning up is worth something. The rest is ranked on three things: exclusive ` +
        `entrants (weight ${KPI_WEIGHTS.entrants}), conversion (${KPI_WEIGHTS.conversion}) ` +
        `and activation (${KPI_WEIGHTS.activation}).`,
    },
    {
      heading: "What we never measure",
      body:
        "No KPI measures anything that happens inside Discord. Not commands, not " +
        "messages, not card opens. Rewarding activity inside somebody else's product " +
        "is a standing incentive to manufacture it, and it is the line we do not cross.",
    },
    {
      heading: "Who a gamer earns for",
      body:
        "At most two servers, ever. Half to the server where they first pressed a bot " +
        "button, half to the server where they pressed Join on that challenge — and a " +
        "whole entrant to one server when both are the same. A gamer who joined from " +
        "the web credits their first server in full.",
    },
    {
      heading: "Who may touch money",
      body:
        "Only the Discord guild owner. Administrators and mapped roles see everything, " +
        "re-announce, edit the profile and request a community challenge — but the " +
        "owner approves the spend and the owner withdraws. An owner aged 13 to 17 " +
        "earns and may spend on community challenges, and cannot withdraw until 18.",
    },
    {
      heading: "Community challenges",
      body:
        `Your own competition for your own members, at ${formatMoney(COMMUNITY_TIERS[1].prizeCents)} ` +
        `for one winner or ${formatMoney(COMMUNITY_TIERS[2].prizeCents)} for ` +
        `${COMMUNITY_TIERS[2].winners}. It is public on the web, which is the point: it ` +
        "advertises your server. There is no rate limit and no fee.",
    },
    {
      heading: "Your member list",
      body:
        "We do not read it unless you ask us to. The analytics tab is opt-in per server, " +
        "the snapshot is always dated, and nothing in the weekly cycle may read one — " +
        "not eligibility, not a KPI, not the pool, not a payout.",
    },
  ];
}

function brandRules(): Rule[] {
  const split = splitOf(CHALLENGE_PRICE_CENTS);
  return [
    {
      heading: "What you are buying",
      body:
        `One challenge is one game, one week, ${formatMoney(CHALLENGE_PRICE_CENTS)}, ` +
        "billed individually. There is no capacity cap and no minimum — buy one, or one " +
        "on every game.",
    },
    {
      heading: "Where the money goes",
      body:
        `${formatMoney(split.prize)} is prize money that sits in a vault before a trophy ` +
        `is awarded, ${formatMoney(split.server)} goes to the servers that carried your ` +
        `entrants, and ${formatMoney(split.cluster)} is ours. The split is the same on ` +
        "every challenge.",
    },
    {
      heading: "When it starts",
      body:
        "Always at the start of a week. There is no date picker for anyone, including " +
        "us. Buy mid-week and it runs next week or any week after; pay at least three " +
        "days before Monday for the most exposure, and by Saturday evening at the latest.",
    },
    {
      heading: "Nothing announces itself",
      body:
        "Payment makes a challenge eligible to be announced, not announced. A person " +
        "sets the game, the metrics, the rules and the trophies, and presses Announce. " +
        "There can never be an announced challenge that is unpaid.",
    },
    {
      heading: "Reach and entrants are counted, never modelled",
      body:
        "Reach is every member of every server your challenge was announced to. " +
        "Entrants are the gamers who joined that challenge. Both are counted again per " +
        "challenge, deliberately — the same gamer entering two weeks is two entrants, " +
        "and we will never add them up into a 'unique audience' figure we cannot stand " +
        "behind.",
    },
    {
      heading: "What we will not show you",
      body:
        `Another brand's numbers, which is exactly why nobody sees yours. An audience ` +
        `sliced by age band, which is a compliance field and not a targeting field. Any ` +
        `group smaller than ${MIN_AUDIENCE_GROUP} people — a count of three is three ` +
        `people somebody can name.`,
    },
    {
      heading: "If a week goes wrong",
      body:
        "A provider outage pushes your challenge to the next week with the same " +
        "entrants and every score reset. If you would rather have the money back, we " +
        "refund the prize and server shares. Nobody already paid loses anything.",
    },
  ];
}

export function rulesFor(who: RuleAudience): Rule[] {
  if (who === "gamer") return gamerRules();
  if (who === "owner") return ownerRules();
  return brandRules();
}
