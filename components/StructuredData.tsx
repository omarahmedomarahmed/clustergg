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
      "Cluster is the engagement layer for Discord gaming communities. Its bot gives members ranked profiles and live stats from the games they play, runs challenges with real trophies, and shares ad revenue with the servers running it.",
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
      "A Discord bot that gives community members ranked gaming profiles and live stats read from official game APIs, runs challenges with real trophies, and pays participating servers a share of ad revenue.",
    // Stated plainly because "is it free" is the first question asked about any
    // bot, and an assistant that has to guess will guess wrong half the time.
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
    featureList: [
      "Ranked gamer profiles rendered as images inside Discord",
      "Live stats synced from official game APIs — never self-reported",
      "Leaderboards, with every board a game runs rather than one per game",
      "Challenges with real, redeemable trophies",
      "Cluster Points earned across every game a member plays",
      "Ad revenue share for servers with 500 or more linked members",
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
export function BotFaqSchema({ threshold = 500, gameCount }: { threshold?: number; gameCount?: number }) {
  const qa: [string, string][] = [
    [
      "Is ClusterBot free?",
      "Yes. Adding the bot, linking game accounts, leaderboards and challenges are all free. Cluster earns from advertising, and shares that revenue with servers rather than charging them.",
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
      `When ${threshold.toLocaleString()} of a server's members have joined Cluster and linked a game account, the server unlocks a share of the ad revenue Cluster earns from that community. The counter is visible from the day the bot is installed via /cluster server.`,
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

export const BOT_FAQ: [string, string][] = [
  ["Is it free?", "Yes — the bot, the profiles, the leaderboards and the challenges. Cluster earns from advertising and shares that revenue with servers rather than charging them."],
  ["Can it read our messages?", "No. We don't request Discord's Message Content intent, so the bot is technically unable to read what anyone writes. It only sees the slash commands and buttons aimed at it."],
  ["How do members link an account?", "/cluster → Connect a game → type an in-game name in a form that opens inside Discord. There's no web form and nothing to leave the app for."],
  ["Are the stats verified?", "They're read from each game's official API, so they're exactly what the game reports. Nothing is typed in by a member."],
  ["What if we remove it?", "Nothing breaks. Member profiles stay on Cluster, and the channel and guides stay in your server until you delete them."],
];
