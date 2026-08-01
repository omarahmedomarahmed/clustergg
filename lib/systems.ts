// Cluster, as systems.
//
// Forty-odd admin pages arranged by what they edit is a filing cabinet. The
// same pages arranged by what they ACHIEVE is a company: nine systems, each
// with an outcome, each run by one department, each with a person who owns it.
//
// That distinction is the whole point of this module. A staff member should not
// open the admin and see "content, games, challenges, users" and have to infer
// what their job is. They should see their system, what it is for, what they do
// on a Monday, how it connects to the systems either side of them, and who to
// ask when it breaks. So every system carries its own operating instructions,
// written for the person who runs it rather than for whoever built it.
//
// This file is PURE — no database, no server imports — so the department editor
// can render the same catalogue in the browser that the access guard enforces
// on the server. One definition, two readers, no way for them to disagree.

export type SystemKey =
  | "ad"
  | "bot"
  | "planets"
  | "quests"
  | "challenges"
  | "brand"
  | "identity"
  | "trophies"
  | "billing";

export type SystemDef = {
  key: SystemKey;
  name: string;
  icon: string;
  /** One line: what this system is FOR. Not what it edits. */
  outcome: string;
  /** The pages this department can open. Prefix match, most specific wins. */
  pages: string[];
  /** Pages inside this system's prefixes that belong to somebody else. */
  except?: string[];
  /** The operating manual for whoever runs it. */
  brief: {
    /** "You are the …" — their job in one sentence. */
    role: string;
    /** What they actually do, in order of how often. */
    doing: string[];
    /** Why it matters to the company, not to the page. */
    bigger: string;
    /** Which systems they hand work to, or take work from. */
    withWhom: { system: SystemKey; why: string }[];
    /** The judgement calls that are not theirs to make alone. */
    escalate: string[];
  };
};

export const SYSTEMS: SystemDef[] = [
  {
    key: "ad",
    name: "Ad system",
    icon: "zap",
    outcome: "Every creative a brand paid for is running, in the right place, and counted.",
    pages: ["/admin/creatives", "/admin/placements", "/admin/ads", "/admin/discord/broadcast"],
    brief: {
      role: "You are the ad operator. Nothing a brand bought reaches a gamer without passing through you.",
      doing: [
        "Approve creatives brands upload, and reject ones that break the size or content rules — a wrong-sized creative is a broken page in front of thousands of gamers.",
        "Check every campaign has a creative for each placement it bought. A paid placement running house art is money we took for nothing.",
        "Watch the schedule: what runs where, this week and next.",
        "Read the analytics daily. A placement whose click rate collapses overnight is usually a broken image, not a bored audience.",
        "Run staff broadcasts into servers when we have something worth saying — sparingly, because the bot's welcome is the thing we spend when we post.",
      ],
      bigger:
        "Placements are the always-on layer under the sponsored challenges. They are what a brand gets before their first challenge starts and after their last one ends, so they are the reason a brand stays a customer between campaigns.",
      withWhom: [
        { system: "brand", why: "They own the brand relationship and the portal; you own what actually runs." },
        { system: "billing", why: "They bill what you launched. A campaign live without a bill is revenue we never invoiced." },
        { system: "bot", why: "Discord placements ride on the bot's posts — if the bot is quiet, your Discord inventory is unsold." },
      ],
      escalate: [
        "A creative that is legal-risky, political, or targets a competitor by name.",
        "Any request to run something outside the placements a brand actually bought.",
      ],
    },
  },
  {
    key: "bot",
    name: "Bot system",
    icon: "link",
    outcome: "The bot is installed, healthy, and talking to every server that has it.",
    pages: ["/admin/discord"],
    except: ["/admin/discord/broadcast", "/admin/discord/requests"],
    brief: {
      role: "You are the operator of our distribution. The bot is how Cluster reaches anybody at all.",
      doing: [
        "Watch installs and removals. A server that removes the bot is the single most important number on your screen — find out why.",
        "Answer server owners in the messages inbox. Same day. An owner who waits three days for an answer stops recommending us.",
        "Check bot analytics for commands that error or time out, and screens nobody ever opens.",
        "Help owners get to 500 linked gamers — that is when their server starts earning, and an earning owner recruits for us.",
        "Keep the HQ server tidy; it is the one server we control end to end.",
      ],
      bigger:
        "Every other system depends on this one. Challenges reach people through the bot, brands buy reach the bot delivers, and gamers arrive because a server owner installed it. If the bot is quiet, nothing else on this list matters.",
      withWhom: [
        { system: "challenges", why: "You know which servers are alive; they decide what runs in them." },
        { system: "billing", why: "Server earnings come out of your growth numbers." },
        { system: "identity", why: "Linked accounts are what turn a server member into a gamer we can count." },
      ],
      escalate: [
        "Any server asking to be removed, or threatening to — that is a conversation for a founder, not a form.",
        "A bot outage lasting more than an hour.",
      ],
    },
  },
  {
    key: "planets",
    name: "Game planet system",
    icon: "planet",
    outcome: "Every game we carry has a world worth visiting and stats worth trusting.",
    pages: ["/admin/games", "/admin/game-worlds", "/admin/spaces", "/admin/connect"],
    brief: {
      role: "You are the curator of the games. A planet is a game's home on Cluster, and you build it.",
      doing: [
        "Keep each planet's art, theme and layout right — the cover, the globe, the regions, the pins.",
        "Maintain the game worlds: champions, agents, weapons, lore. This is what a gamer explores when they aren't competing.",
        "Watch provider health. A game whose API stopped returning stats is a game whose challenges silently stop scoring.",
        "Review planet requests from gamers asking for a game we don't carry — the queue tells you what to add next.",
        "Onboard a new provider when we add a game: credentials, capabilities, the connect card.",
      ],
      bigger:
        "A game we can score is a game a brand can sponsor. Every planet you open is new inventory for the ad and challenge systems, and every provider that breaks quietly removes inventory we are still selling.",
      withWhom: [
        { system: "challenges", why: "They can only build on metrics you have made available." },
        { system: "identity", why: "Linking an account starts on your connect cards." },
        { system: "brand", why: "The games you carry are the games we can sell." },
      ],
      escalate: [
        "Adding a game that needs a paid or approval-gated API.",
        "Any provider whose terms restrict what we can show or store.",
      ],
    },
  },
  {
    key: "quests",
    name: "Quest system",
    icon: "spark",
    outcome: "A gamer who joins has something to do in their first ten minutes, and a reason to come back.",
    pages: ["/admin/quests"],
    brief: {
      role: "You run the progression. Quests are the reason somebody who lost their first challenge opens Cluster again.",
      doing: [
        "Tune tiers and thresholds. A first tier nobody reaches is a quest that does nothing; one everybody reaches on day one is a quest that means nothing.",
        "Keep the maps and art current, and the milestone copy readable.",
        "Watch Cluster Point rewards against how many people actually reach each tier.",
      ],
      bigger:
        "Challenges create a spike and quests create a habit. Everyone who does not win this week needs a reason to be here next week, and that reason is yours.",
      withWhom: [
        { system: "identity", why: "Quest progress is read off linked accounts." },
        { system: "trophies", why: "Cluster Points and trophies are two currencies that must not contradict each other." },
      ],
      escalate: ["Any change to what a Cluster Point is worth."],
    },
  },
  {
    key: "challenges",
    name: "Challenge system",
    icon: "trophy",
    outcome: "Every week, in every game we sell, there is a competition running that people entered.",
    pages: ["/admin/challenges", "/admin/leaderboards", "/admin/discord/requests", "/admin/profile-week"],
    brief: {
      role: "You are the competition director. What you approve runs under Cluster's name in front of everyone.",
      doing: [
        "Review the request queue. Server owners' requests are private to their community; a brand's are paid slots that go out to the network — read them with different questions.",
        "Build and schedule challenges: game, metric, dates, trophies, and who can enter.",
        "Watch live challenges for a metric that stopped moving — that means the provider broke, not that everyone stopped playing.",
        "End challenges cleanly. Ending freezes the standings and hands out the trophies, so it is the moment a winner becomes a winner.",
        "Run Profile of the Week: the standings, the Sunday call, the podium.",
      ],
      bigger:
        "The challenge is the product. A brand is not buying an impression, they are paying gamers to play — and you are the person who makes sure the thing they paid for actually happened.",
      withWhom: [
        { system: "trophies", why: "You choose the prize; they mint and pay it." },
        { system: "brand", why: "A sponsored challenge has a customer waiting on its result." },
        { system: "bot", why: "A challenge nobody was told about is a challenge nobody enters." },
        { system: "planets", why: "You can only score what their providers deliver." },
      ],
      escalate: [
        "Approving a challenge whose prize we would have to fund ourselves.",
        "Ending or cancelling a challenge that has already been announced.",
        "Any dispute about who won.",
      ],
    },
  },
  {
    key: "brand",
    name: "Platform content & self-branding",
    icon: "type",
    outcome: "Every word and image Cluster shows about itself is current and says the same thing.",
    pages: [
      "/admin/content", "/admin/language", "/admin/translations", "/admin/backgrounds",
      "/admin/cards", "/admin/brand-kit", "/admin/chrome", "/admin/mobile",
      "/admin/creative-studio", "/admin/partners", "/admin/dataroom", "/admin/brands/testimonials",
    ],
    brief: {
      role: "You own how Cluster reads and looks. Every headline, every card background, every button label.",
      doing: [
        "Keep the public copy true. Pricing that changed and a pricing page that didn't is the fastest way to lose a brand's trust.",
        "Maintain the Arabic alongside the English — a half-translated page is worse than an untranslated one.",
        "Manage the art: page backgrounds, card backgrounds, the brand kit, nav and footer, mobile chrome.",
        "Collect testimonials from challenge winners for the brands' end-of-month reports. Real quotes, from real people, typed as they said them.",
        "Keep the data room current — it is what an investor reads when we are not in the room.",
      ],
      bigger:
        "Everything else here is a machine; you are the voice it speaks in. A brand decides whether to trust us from a pricing page long before they meet anybody.",
      withWhom: [
        { system: "ad", why: "Your card backgrounds are the frame their creatives sit in." },
        { system: "billing", why: "Never let published pricing drift from what we actually charge." },
      ],
      escalate: ["Any change to what we claim about the business — pricing, reach, revenue share."],
    },
  },
  {
    key: "identity",
    name: "Gamer identity system",
    icon: "user",
    outcome: "A gamer's profile is theirs, verified, and worth showing off.",
    pages: ["/admin/users", "/admin/linked-accounts"],
    brief: {
      role: "You look after the gamers themselves: their profiles, their linked accounts, their standing.",
      doing: [
        "Watch sync health. An account stuck in error is a gamer whose stats have quietly frozen and who will assume we're broken.",
        "Handle profile problems: someone impersonating another player, an offensive name, a stolen avatar.",
        "Keep customization working — the profile is the thing gamers share, and sharing is how we grow.",
        "Investigate anything that looks like vote manipulation on Profile of the Week.",
      ],
      bigger:
        "Every claim we make to a brand rests on this: our audience is verified because their accounts are linked to the game's own API. Nothing here is self-reported, and that is the entire reason our numbers mean anything.",
      withWhom: [
        { system: "planets", why: "Providers break upstream of you; you see it as sync errors." },
        { system: "trophies", why: "A winner has to be a real, verified person before we pay them." },
      ],
      escalate: ["Banning an account.", "Any suspected fraud around prizes."],
    },
  },
  {
    key: "trophies",
    name: "Trophies & payout",
    icon: "medal",
    outcome: "Every winner gets what they were promised, and can turn it into money.",
    pages: ["/admin/trophies", "/admin/redeems"],
    brief: {
      role: "You are the one who pays people. A gamer's trust in Cluster is decided entirely by whether this works.",
      doing: [
        "Maintain the trophy catalogue and what each is worth. A trophy's value is a promise we have to honour.",
        "Build the branded sets — three per sponsor, carrying their logo. A branded trophy stays on a winner's profile permanently, so it must never end up in another brand's challenge.",
        "Work the redemption queue. Every day one sits there is a day a winner tells their server we don't pay.",
        "Check the person before paying: verified account, real placement, no duplicate claim.",
      ],
      bigger:
        "Seventy per cent of what a brand pays goes to gamers, and you are where that promise either happens or doesn't. Everything the marketing says collapses if a payout stalls.",
      withWhom: [
        { system: "challenges", why: "They assign the trophies you have to honour." },
        { system: "billing", why: "Payouts are cash out; they reconcile it against what came in." },
        { system: "identity", why: "They confirm the winner is who they say they are." },
      ],
      escalate: [
        "Any redemption above the normal amount, or from an account linked in the last week.",
        "A trophy whose stated value we cannot actually pay.",
      ],
    },
  },
  {
    key: "billing",
    name: "Billing & revenue",
    icon: "diamond",
    outcome: "Money in matches what we sold, money out matches what we owe.",
    pages: ["/admin/billing", "/admin/brands", "/admin/brand-enquiries"],
    except: ["/admin/brands/testimonials"],
    brief: {
      role: "You are the books. Brand subscriptions in, campaign bills in, prize money and server earnings out.",
      doing: [
        "Bill every campaign that went live, and check nothing live is unbilled.",
        "Track brand subscriptions: who is on which plan, who is due, who lapsed.",
        "Calculate server monetization — which servers unlocked a share, and what each is owed this month.",
        "Reconcile trophy distribution: for each challenge, which server each of first, second and third came from, how many servers had a winner, and how much went to each.",
        "Work the enquiry pipeline so a brand who asked to buy actually gets sold to.",
      ],
      bigger:
        "Cluster's whole claim is that it costs a brand nothing but the buy — no setup, no ad ops, no account management. That only stays true if the billing is boring and correct. The moment an owner is underpaid or a brand is double-billed, the product's main promise is the thing in question.",
      withWhom: [
        { system: "ad", why: "They launch it; you bill it." },
        { system: "trophies", why: "Their payouts are your largest outflow." },
        { system: "bot", why: "Server earnings are computed from their growth numbers." },
        { system: "brand", why: "Published pricing must equal charged pricing." },
      ],
      escalate: [
        "Any discount, refund, or waived fee.",
        "A server owner disputing what they earned.",
      ],
    },
  },
];

export const SYSTEM_KEYS = SYSTEMS.map((s) => s.key);

export function systemBy(key: string): SystemDef | null {
  return SYSTEMS.find((s) => s.key === key) ?? null;
}

/**
 * Which system owns a page.
 *
 * Longest prefix wins, and `except` is checked first, so a page nested inside
 * another system's prefix can belong to a different department —
 * `/admin/brands/testimonials` is content work, not billing work, even though
 * it lives under `/admin/brands`.
 */
export function systemForPath(path: string): SystemDef | null {
  let best: SystemDef | null = null;
  let bestLen = -1;
  for (const s of SYSTEMS) {
    if (s.except?.some((e) => path === e || path.startsWith(`${e}/`))) continue;
    for (const p of s.pages) {
      if ((path === p || path.startsWith(`${p}/`)) && p.length > bestLen) {
        best = s; bestLen = p.length;
      }
    }
  }
  return best;
}

/**
 * Pages every staff member can open regardless of department.
 *
 * Deliberately tiny: the console shell itself and the system directory. A staff
 * member with no department sees an empty console and a line telling them to
 * ask for one — the correct behaviour, not a bug to route around.
 *
 * The distinction between the two lists is load-bearing and was a real bug:
 * `/admin` treated as a PREFIX opens `/admin/anything`, which is every page in
 * the console. It is an exact match only.
 */
export const ALWAYS_OPEN_EXACT = ["/admin"];
export const ALWAYS_OPEN_UNDER = ["/admin/systems"];

/** Everything universally reachable, for callers that just need the list. */
export const ALWAYS_OPEN = [...ALWAYS_OPEN_EXACT, ...ALWAYS_OPEN_UNDER];

export function pathAllowedFor(systems: string[], path: string): boolean {
  if (ALWAYS_OPEN_EXACT.includes(path)) return true;
  if (ALWAYS_OPEN_UNDER.some((p) => path === p || path.startsWith(`${p}/`))) return true;
  const owner = systemForPath(path);
  // A page no system claims is admin-only. New pages are invisible to staff
  // until someone deliberately files them, which is the safe default: the
  // alternative is a page appearing in a department nobody assigned it to.
  if (!owner) return false;
  return systems.includes(owner.key);
}
