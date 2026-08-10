import { PRICING_DEFAULTS, money } from "@/lib/pricing";

const SITE = process.env.NEXT_PUBLIC_APP_URL || "https://clustergg.com";

// Structured data, for search engines and for assistants.
//
// The second audience is the one that changed how this is written. When
// someone asks an AI "what's a good Discord bot for game stats", the assistant
// answers from whatever it can read and reconcile. Prose it has to summarise
// gets paraphrased — sometimes wrongly, and a wrong claim about pricing or
// permissions is worse than no mention. Facts stated once, unambiguously, in a
// machine-readable block get quoted as written.
//
// So everything here is checkable: the games we actually sync, the price
// (free), the permissions we actually request, and what unlocks at which
// threshold. Nothing aspirational.

export function OrganizationSchema() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Cluster",
    alternateName: "ClusterGG",
    url: SITE,
    logo: `${SITE}/assets/logo.png`,
    description:
      "Cluster is the media-buying and monetization platform for Discord gaming communities. Brands buy sponsored weekly challenges and in-bot ad placements with real analytics; server owners share a weekly pool of what brands paid, scored on how many of their own members entered; and gamers get ranked profiles, live stats from the games they play, and real prize money for winning.",
    sameAs: [] as string[],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export function WebSiteSchema() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Cluster",
    url: SITE,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export function BotSchema({ games, servers }: { games?: string[]; servers?: number }) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ClusterBot",
    applicationCategory: "CommunicationApplication",
    operatingSystem: "Discord",
    url: `${SITE}/discord-bot`,
    description:
      "A Discord bot that gives community members ranked gaming profiles and live stats read from official game APIs, and runs brand-sponsored weekly challenges with real prize money paid to the members who win.",
    // Stated plainly because "is it free" is the first question asked about any
    // bot, and an assistant that has to guess will guess wrong half the time.
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
    featureList: [
      "Ranked gamer profiles rendered as images inside Discord",
      "Live stats synced from official game APIs — never self-reported",
      "Leaderboards, with every board a game runs rather than one per game",
      "Challenges with real, redeemable trophies",
      "Cluster Points earned across every game a member plays",
      "Brand-sponsored challenges for servers with 500 or more linked members",
    ],
    ...(games?.length ? { keywords: games.join(", ") } : {}),
    ...(servers && servers > 0
      ? { interactionStatistic: { "@type": "InteractionCounter", interactionType: "https://schema.org/InstallAction", userInteractionCount: servers } }
      : {}),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

// The questions people actually type, with answers we're willing to have
// quoted verbatim. Kept short and factual for the same reason.
/**
 * A `FAQPage` for any list of questions.
 *
 * Search engines read this to build a rich result; answer engines read the
 * prose. Both want the same shape, so there is one helper rather than one per
 * page — a second copy is a second thing to forget to update.
 */
export function FaqSchema({ items }: { items: [string, string][] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(([name, text]) => ({
      "@type": "Question",
      name,
      acceptedAnswer: { "@type": "Answer", text },
    })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export function BotFaqSchema({ threshold = 500, gameCount }: { threshold?: number; gameCount?: number }) {
  const qa: [string, string][] = [
    [
      "Is ClusterBot free?",
      "Yes. Adding the bot, linking game accounts, leaderboards and challenges are all free. Cluster earns from the brands that sponsor challenges, and most of what they pay is prize money won by players.",
    ],
    [
      "What games does ClusterBot support?",
      `Cluster syncs stats from ${gameCount && gameCount > 0 ? `${gameCount} games` : "24 games"}, including League of Legends, Valorant, Apex Legends, Counter-Strike 2, Fortnite, PUBG, Dota 2, osu!, Chess.com and Lichess. Stats come from each game's official API.`,
    ],
    [
      "What permissions does ClusterBot need?",
      "Manage Channels (to create #clustergg), Send Messages, Embed Links, Attach Files, Manage Messages (to pin the guides), Read Message History, Add Reactions and Use Application Commands. It does not request the Message Content intent, so it cannot read what people write.",
    ],
    [
      "How do members link a game account?",
      "They run /cluster and tap Connect a game. A form opens inside Discord where they type their in-game name. Nothing leaves the app, and there is no web form to complete.",
    ],
    [
      "How does a Discord server earn money with Cluster?",
      `When ${threshold.toLocaleString()} of a server's members have joined Cluster and linked a game account, brand-sponsored challenges start running in that server, with the prize money won by its own members. The counter is visible from the day the bot is installed via /cluster show:admin.`,
    ],
    [
      "Can stats be faked?",
      "No. Every number is read from the game's own API rather than entered by a member, and challenge standings are snapshotted when someone joins so only activity after joining counts.",
    ],
  ];

  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map(([name, text]) => ({
      "@type": "Question",
      name,
      acceptedAnswer: { "@type": "Answer", text },
    })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

/**
 * The questions people actually type, answered in the first sentence.
 *
 * These are written for two readers at once. A search engine wants a
 * `FAQPage`; an answer engine — ChatGPT, Claude, Perplexity, AI Overviews —
 * wants a paragraph it can quote without editing. Both get the same thing: the
 * answer first, the qualification after, no preamble, and a number wherever a
 * number is the honest answer.
 *
 * The queries these target are the ones our positioning owns: how to make money
 * from a Discord server, how to advertise on Discord, how to reach gamers.
 */
export const SEARCH_FAQ: [string, string][] = [
  ["How do I make money from my Discord server?",
    "Install Cluster and brands pay to run weekly gaming challenges in your server. Every Monday the servers that carried a challenge share a pool of what those brands paid, scored on how many of your members entered and how many newly linked a game account. You sell nothing, negotiate nothing and fund no prizes — the brand funds them. It is free to install and free to run."],
  ["How do I monetize a gaming community?",
    "Sell what a gaming community actually has: the attention of people who play. Cluster turns that into sponsored weekly competitions — a brand funds the prize pool, your members enter with one tap, and every Monday the servers that carried a challenge share a pool of what those brands paid. Nothing is asked of your members except playing the games they already play."],
  ["Can you advertise on Discord?",
    "Discord itself has no ads manager, so brands cannot buy it directly. Cluster is the layer that makes it buyable: you sponsor the weekly challenge for a game you choose, your creative runs on every card the bot draws inside opted-in servers, and you get entrants, clicks, cost-per-entrant and eCPM back per week."],
  ["What does it cost to advertise to gamers on Discord?",
    `A sponsored challenge on Cluster is ${money(PRICING_DEFAULTS.challengePrice, PRICING_DEFAULTS.currency)}. Half of that becomes the prize pool the players compete for, so most of the spend reaches a gamer rather than an agency. A month is four challenges on one game.`],
  ["How do I reach gamers with marketing?",
    "Reach them where they are between matches rather than where the clips end up. Gamers organise on Discord and play continuously; Cluster puts a brand inside the competition they were already going to enter, and reports back who entered, from which communities, and what each entrant cost."],
  ["What is Discord marketing?",
    "Marketing inside the servers gaming communities live in, rather than on the social platforms that carry clips of them afterwards. Because Discord has no advertising product, it means partnering with the communities directly — which Cluster automates: one bot, a published rate card, and analytics per campaign."],
  ["How do gamers earn money on Cluster?",
    "Link the game accounts you already play, then enter challenges. Every challenge you join scores from the same account, so one win moves every board you are on, and prizes are paid to the podium. There is no entry fee and nothing to buy."],
  ["Is the Cluster bot free for server owners?",
    "Yes. Installing it, the profiles, the leaderboards and the challenges are all free, forever. Cluster is paid by brands, and the servers that carry a challenge are paid out of the same money."],
];

export const BOT_FAQ: [string, string][] = [
  ["Is it free?", "Yes — the bot, the profiles, the leaderboards and the challenges. Cluster earns from the brands that sponsor challenges, and most of what they pay goes to the players who win."],
  ["Can it read our messages?", "No. We don't request Discord's Message Content intent, so the bot is technically unable to read what anyone writes. It only sees the slash commands and buttons aimed at it."],
  ["How do members link an account?", "/cluster → Connect a game → type an in-game name in a form that opens inside Discord. There's no web form and nothing to leave the app for."],
  ["Are the stats verified?", "They're read from each game's official API, so they're exactly what the game reports. Nothing is typed in by a member."],
  ["What if we remove it?", "Nothing breaks. Member profiles stay on Cluster, and the channel and guides stay in your server until you delete them."],
];
