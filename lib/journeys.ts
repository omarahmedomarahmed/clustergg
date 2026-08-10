// What each stakeholder actually DOES, in order, as data. B119.
//
// ===== WHY THE GUIDES NEEDED THIS AND A RULE LIST WAS NOT ENOUGH =====
//
// `lib/rules.ts` is a register of promises: every rule that binds a customer,
// with its reason on the same line. It is the right shape for the thing it is —
// a page somebody opens when they want to know whether we are allowed to do
// what we just did.
//
// It is the wrong shape for the question people actually arrive with, which is
// "what happens, and in what order". A rule list answers that only if you
// already know the sequence well enough to sort it yourself. Somebody who has
// just installed the bot does not.
//
// So each audience gets a JOURNEY as well: the steps in the order they happen,
// each with the one sentence that stops the step going wrong, and each pointing
// at where it is done. The rules stay underneath, unchanged, for the reader who
// wants the fine print rather than the path.
//
// ===== EVERY FIGURE IS IMPORTED, THE SAME AS THE RULES =====
//
// A guide that quotes a number the product does not use is a promise we are
// held to by whoever read it. Nothing here is retyped: the step count comes
// from `stepsFor`, the withdrawal floor from the wallet, the split from the
// vaults, the lifecycle from the stage machine.

import { STAGE_ORDER, STAGES } from "@/lib/challenge-stage";
import { DEFAULT_SPLIT } from "@/lib/vaults";
import { MIN_WITHDRAWAL } from "@/lib/server-wallet";
import { PRIVATE_FEE_PCT } from "@/lib/private-quote";
import { PARTICIPATION_SHARE } from "@/lib/server-score";
import { MAX_PLACES } from "@/lib/prize-places";
import { MIN_REDEEM_AGE } from "@/lib/eligibility";
import { stepsFor } from "@/lib/unlock";
import type { Audience } from "@/lib/rules";

export type JourneyStep = {
  /** One or two words. This is the label under the node in the diagram. */
  title: string;
  /** What happens, in the reader's own terms. */
  body: string;
  /**
   * The one sentence that stops this step going wrong.
   *
   * Optional, and left off where there is nothing true to say — a helper line
   * on every step teaches people to skip helper lines.
   */
  helper?: string;
  /** An `Icon` name. */
  icon: string;
  /** Where this step actually happens, when there is a page for it. */
  href?: string;
};

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const UNLOCK = stepsFor({ linked: false, email: false, profile: false });

export const JOURNEYS: Record<Audience, JourneyStep[]> = {
  gamer: [
    {
      title: "Link a game",
      body: UNLOCK[0].detail,
      helper: "We read your stats from the game's own API. Nothing here is self-reported, which is the only reason a leaderboard means anything.",
      icon: "gamepad",
      href: "/settings/connections",
    },
    {
      title: "Confirm your email",
      body: UNLOCK[1].detail,
      helper: "The code arrives on its own at signup — there is no button to hunt for.",
      icon: "send",
    },
    {
      title: "Three questions",
      body: UNLOCK[2].detail,
      helper: "Nobody sees your age or your country. Only the flag beside your name.",
      icon: "globe",
      href: "/onboarding",
    },
    {
      title: "Earning switches on",
      body: `With all ${UNLOCK.length} done, points start counting and you can enter challenges. Nothing accrues before this, and nothing you had already earned is touched.`,
      helper: "There is a ceiling on points per day. It is the reason what you earn is still worth something in six months.",
      icon: "spark",
      href: "/quests",
    },
    {
      title: "Enter a challenge",
      body: "Join from inside your Discord server or from the challenge page. You can enter the moment it is announced, days before it starts.",
      helper: "Joining early gives no head start — everybody is measured from the same moment the challenge goes live.",
      icon: "zap",
      href: "/planets",
    },
    {
      title: "Play your week",
      body: "Play the game you were going to play anyway. Your stats sync on a schedule and the standings move with them.",
      helper: `A challenge pays up to ${MAX_PLACES} places, and which places pay is shown before you enter.`,
      icon: "target",
    },
    {
      title: "Win a trophy",
      body: "A trophy lands on your profile and stays there. It carries the sponsor's brand and a cash value.",
      helper: "The trophy is the part you keep. Cashing it is optional and separate.",
      icon: "trophy",
      href: "/profile",
    },
    {
      title: "Cash it in",
      body: `From ${MIN_REDEEM_AGE}, redeem a trophy and choose where the money lands on our payout partner's own page.`,
      helper: "We never see or store your payment details — only which method you preferred.",
      icon: "cpCoin",
      href: "/redeem",
    },
  ],

  owner: [
    {
      title: "Install the bot",
      body: "One click, free forever. Your members get ranked profiles and live stats from the games they already play.",
      helper: "It cannot read your messages. We do not request Discord's Message Content intent, so it is technically unable to.",
      icon: "satellite",
      href: "/discord-bot",
    },
    {
      title: "Members link accounts",
      body: "Each member connects the games they play. That number is what your server is measured on.",
      helper: "Linked accounts, not member count. A quiet server of five thousand scores below a loud one of three hundred.",
      icon: "users",
    },
    {
      title: "Carry a challenge",
      body: "When a brand sponsors a game your community plays, the challenge runs in your server. You do nothing — the bot posts it, scores it and announces the result.",
      helper: "Only public challenges count toward the pool. A private one you bought yourself grows you; it does not pay you twice.",
      icon: "zap",
    },
    {
      title: "Monday scores the week",
      body: `Every server that carried a challenge is scored on entrants, newly linked members and conversion, ranked inside its own size bracket. ${PARTICIPATION_SHARE}% of the pool is split evenly between everybody who took part.`,
      helper: "A bracket decides who you are compared against and nothing else, so large servers can never take the small servers' share.",
      icon: "chart",
      href: "/pool",
    },
    {
      title: "A payout opens",
      body: "Your share appears in your wallet as earned. Money moves when a human releases it.",
      helper: "Your first payout is held for 30 days. It is the only mechanism that can claw back a fraud, which is why anybody can be paid at all.",
      icon: "cpCoin",
    },
    {
      title: "Withdraw or spend",
      body: `Take it out from ${money(MIN_WITHDRAWAL)}, or spend it on a private challenge for your own members — the prize pool plus ${PRIVATE_FEE_PCT}%.`,
      helper: "Asking to withdraw makes the money unspendable immediately, so it can never go out twice.",
      icon: "send",
    },
  ],

  brand: [
    {
      title: "Pick your games",
      body: "Choose the titles your audience plays. Each one gets a sponsored challenge every week, carrying your name.",
      helper: "You see the verified, linked audience per game before you spend — read from each game's own API, never self-reported.",
      icon: "target",
      href: "/pricing",
    },
    {
      title: "Confirm and pay",
      body: "One to four consecutive weeks. Four is a month, which is how a media buy is planned. Anything larger is built with you and confirmed in your own portal.",
      helper: `Half of what you pay is prize money. It is why the challenges get entered.`,
      icon: "diamond",
    },
    {
      title: "We announce it",
      body: "Every server running that game is told the challenge is coming, days before it starts.",
      helper: "Nothing is announced until the invoice clears. An announcement is a promise to a community, and one we have to unwind is a community that trusts the next one less.",
      icon: "satellite",
    },
    {
      title: "The week runs",
      body: "Gamers enter from inside their servers and play. Your creative is on every card the bot draws.",
      helper: "Announced and live are separate gates on purpose: publishing early is how a competition gets a field, scoring early would hand an early entrant a head start.",
      icon: "zap",
    },
    {
      title: "Read the delivery",
      body: "Entrants, completion, the servers it landed in, cost per entrant — counted, in your own portal, per week.",
      helper: "You never see another brand's numbers, which is exactly why they never see yours. What you get instead are platform benchmarks with nobody named.",
      icon: "chart",
    },
    {
      title: "Your trophy, kept",
      body: "The winners keep a trophy carrying your brand on their profile permanently. Not seen — kept.",
      helper: "You choose which of your trophies goes out, and if we cannot use one we come back to you rather than substituting quietly.",
      icon: "trophy",
    },
  ],
};

/**
 * The four vaults, in the order that reads as an argument rather than a list:
 * the players' half first, ours last.
 *
 * The shares are read from `DEFAULT_SPLIT` — an operator can change them, and a
 * guide that hard-coded 50/15/15/20 would be wrong the day they did.
 */
export const MONEY_FLOW = [
  {
    key: "prize" as const,
    label: "Prize money",
    pct: DEFAULT_SPLIT.prize,
    to: "Gamers, as trophies",
    note: "A liability, not income. It is owed the moment a challenge awards its podium.",
    tone: "#fbbf24",
  },
  {
    key: "server" as const,
    label: "Server pool",
    pct: DEFAULT_SPLIT.server,
    to: "The servers that carried it",
    note: "Divided every Monday between the servers a public challenge ran in.",
    tone: "#34d399",
  },
  {
    key: "cp" as const,
    label: "Points vault",
    pct: DEFAULT_SPLIT.cp,
    to: "Every gamer who plays",
    note: "Funds every Cluster Point earned from ordinary play, and sets the daily ceiling.",
    tone: "#22d3ee",
  },
  {
    key: "cluster" as const,
    label: "Cluster",
    pct: DEFAULT_SPLIT.cluster,
    to: "Us",
    note: "What runs the platform. There is no operations line under it — software reads the APIs.",
    tone: "#a78bfa",
  },
];

/** The challenge lifecycle, for the diagram. Straight from the stage machine. */
export const LIFECYCLE = STAGE_ORDER.map((k) => STAGES[k]);
