import type { SectionKind, SectionData } from "@/lib/dataroom/types";

// The two documents, as shipped.
//
// These are seeds, not fixtures: they're written once into the database on
// first boot and every word of them is editable afterwards. Nothing here is
// re-applied over an admin's edits, because a deploy silently reverting someone's
// copy is the fastest way to make a CMS untrusted.
//
// Written to be defensible. Numbers are never asserted in prose — the sections
// that carry numbers read them live, so a deck can't go stale between the day
// it was written and the day an investor opens it.

export type SeedSection = {
  kind: SectionKind;
  anchor: string;
  navLabel: string;
  title?: string;
  subtitle?: string;
  body?: string;
  data?: SectionData;
};

export type SeedDoc = {
  slug: string;
  kind: "deck" | "profile";
  title: string;
  subtitle: string;
  summary: string;
  accent: string;
  accent2: string;
  contactEmail: string;
  contactNote: string;
  sections: SeedSection[];
};

const MAU_LADDER = [1_000, 10_000, 100_000, 1_000_000];

export const SEED_DOCS: SeedDoc[] = [
  // ===================== PITCH DECK =====================
  {
    slug: "pitch-deck",
    kind: "deck",
    title: "ClusterGG",
    subtitle: "The only structured way to advertise to gamers on Discord",
    summary:
      "Our investor deck: the audience nobody can buy, the product that opens it, how we price it, and where it goes next — with every number read live from production.",
    accent: "#8b5cf6",
    accent2: "#22d3ee",
    contactEmail: "founders@clustergg.com",
    contactNote: "We reply to everything. Ask for the data you want and we'll open it.",
    sections: [
      {
        kind: "hero",
        anchor: "top",
        navLabel: "Overview",
        title: "Every gamer is on Discord. Nobody can advertise there.",
        subtitle:
          "Cluster is a gaming platform and a Discord bot. We turn communities into a measured audience and sell it as the one ad unit gamers actually enter: a weekly challenge with a brand's name on it.",
        data: {
          badge: "Pre-seed · live product · revenue model shipped",
          ctaLabel: "See the live product",
          ctaHref: "#product",
        },
      },
      {
        kind: "explainer",
        anchor: "problem",
        navLabel: "Problem",
        title: "Reaching gamers costs a fortune. Most of it misses.",
        subtitle: "Three ways to buy a gamer's attention today. Every one makes a brand pay for the people who aren't gamers.",
        data: {
          steps: [
            { icon: "trophy", label: "Esports", note: "Six figures, one weekend, one city. You reach the fans who could afford a ticket and the stream viewers who muted your bumper." },
            { icon: "monitor", label: "Social ads", note: "Meta and TikTok sell you the phone break between two matches. They scroll past on the way back to the lobby, and you paid for every impression that missed." },
            { icon: "lock", label: "Discord, by hand", note: "The brands that know the insight end up DMing big servers, who charge premium because the brand came to them. No rate card, no targeting, no reporting." },
            { icon: "chart", label: "No way to compare", note: "None of the three can tell a media buyer how many verified players of a named game they actually reached. So gaming budgets stay smaller than gaming audiences." },
          ],
        },
      },
      {
        kind: "text",
        anchor: "insight",
        navLabel: "Insight",
        title: "Gamers don't live where the money is being spent.",
        body:
          "A gamer might have a Facebook account. Might have TikTok. Might make it to an event if the ticket is affordable. But every single one of them has Discord — it is where the squad is, where the match gets organised, and where the argument about the last game happens. They are on Discord before they pick up their phone and back on Discord the second they put it down.\n\n"
          + "Discord has no ads manager. No Business Suite, no targeting, no pixel, no self-serve buy. Unlike every other platform where an audience of this size gathers, there is no way to purchase attention at all. That is not a gap in a media plan — it is the entire gaming audience sitting behind a door with no handle.\n\n"
          + "The absence is the opportunity. A brand cannot route around it, a competitor cannot buy their way past it, and the only route in today is a personal relationship with one server at a time. We built the structured version.",
        data: {
          bullets: [
            "100% of gamers have Discord. 0 ways to buy ads on it.",
            "Big servers already charge brands premium rates by hand — the demand is proven, the infrastructure isn't.",
            "The unit that works isn't a banner. It's a competition the community would have wanted anyway.",
          ],
        },
      },
      {
        kind: "explainer",
        anchor: "solution",
        navLabel: "Solution",
        title: "We built the handle.",
        subtitle: "One click to install. Nothing to configure. It never reads a message.",
        data: {
          loop: true,
          steps: [
            { icon: "rocket", label: "Install", note: "One click. The bot builds its own channel, posts a guide for everything and pins it. There is nothing to configure." },
            { icon: "link", label: "Members link", note: "A member links a game account to get a ranked profile. That link is the measurement — verified against the game's own API, so it can't be inflated." },
            { icon: "trophy", label: "They compete", note: "A weekly challenge per game with real money on it. Stats are snapshotted the moment somebody joins, so only new play counts." },
            { icon: "crown", label: "The money lands", note: "The brand pays for the challenge; 70% of it is won by players, inside the server that hosted it. The owner's incentive becomes recruiting for us." },
          ],
        },
      },
      {
        kind: "product",
        anchor: "product",
        navLabel: "The bot",
        title: "This is the product, running.",
        subtitle: "Not a screenshot. Press a button — it behaves exactly as it does in a server right now.",
        data: { focus: "bot" },
      },
      {
        kind: "showcase",
        anchor: "everything",
        navLabel: "What it renders",
        title: "Every reply is art.",
        subtitle: "Drawn live by the same renderer that serves Discord.",
        data: {
          cards: [
            { kind: "profile", caption: "A gamer's profile — their own art, their trophies, every game they play" },
            { kind: "planet", caption: "A game world — live challenges, standings, who's ranked on it" },
            { kind: "challenge", caption: "A live challenge — trophies with real, redeemable value" },
            { kind: "leaderboard", caption: "A leaderboard, straight from the game's official API" },
          ],
        },
      },
      {
        kind: "product",
        anchor: "gamer",
        navLabel: "The gamer",
        title: "One identity, every game.",
        subtitle: "Ranks, Cluster Points and every account they play, on one card they can share anywhere.",
        data: { focus: "profile" },
      },
      {
        kind: "product",
        anchor: "worlds",
        navLabel: "Game worlds",
        title: "Every game is a world.",
        subtitle: "Its own planet, its own leaderboards, its own live competitions.",
        data: { focus: "leaderboards" },
      },
      {
        kind: "product",
        anchor: "arena",
        navLabel: "Challenges",
        title: "Competitions nobody can fake.",
        subtitle: "Stats snapshotted on join, scored from the game's own API, paid in trophies with real value.",
        data: { focus: "challenges" },
      },
      {
        kind: "showcase",
        anchor: "quests",
        navLabel: "Quests",
        title: "Playing anything moves one ladder.",
        data: {
          cards: [
            { kind: "quest", caption: "A quest map — milestones earned across every game at once" },
            { kind: "cp", caption: "Cluster Points, the score that carries between games" },
          ],
        },
      },
      {
        kind: "traction",
        anchor: "traction",
        navLabel: "Traction",
        title: "Where we are today",
        subtitle: "Read from production the moment you loaded this page.",
      },
      {
        kind: "servers",
        anchor: "servers",
        navLabel: "Servers",
        title: "The communities running it",
        subtitle: "Every one of these installed the bot themselves.",
      },
      {
        kind: "milestones",
        anchor: "milestones",
        navLabel: "Milestones",
        title: "The ladder",
        subtitle:
          "Monthly active audience is the combined membership of every server running the bot — the people it can reach. The bar moves on its own.",
        data: { targets: MAU_LADDER, metric: "reach" },
      },
      {
        kind: "explainer",
        anchor: "business",
        navLabel: "Business model",
        title: "Sell a measured audience. Pay the people who built it.",
        data: {
          steps: [
            { icon: "shield", label: "Verified audience", note: "This many verified players of this game, in communities of this size — described precisely, because every account was read from an official API." },
            { icon: "trophy", label: "The challenge is the unit", note: "A sponsored weekly competition carrying a brand's name, sold per game per month. Entered on purpose rather than scrolled past, which is why it prices above a banner." },
            { icon: "crown", label: "Players keep most of it", note: "70% of every sponsorship is prize money won inside the server that ran it. Not generosity — the acquisition channel. An owner whose members win money recruits for us, and that is more credible than any ad we could buy." },
            { icon: "zap", label: "Near-zero to serve", note: "The bot runs inside the same web application as the site — no gateway process, no always-on host — so a new server costs close to nothing." },
          ],
        },
      },
      {
        kind: "pricing",
        anchor: "pricing",
        navLabel: "Rate card",
        title: "What we charge, and what it costs us",
        subtitle:
          "Published at clustergg.com/pricing rather than quoted on request. Every figure below is read from the live rate card as this page loads.",
      },
      {
        kind: "text",
        anchor: "economics",
        navLabel: "Unit economics",
        title: "The whole model is one $250 transaction, repeated.",
        body:
          "A brand buys a game's weekly challenge for $250. $175 of that is the prize, paid as three trophies carrying their brand and redeemed by the three gamers who placed. We keep $75. That is 70% of gross revenue reaching players by construction, not by policy — and it is the entire cost of goods.\n\n"
          + "The prize does not move when a second brand signs, because the same competition carries whoever is sponsoring it. Per game per month that is $1,000 in, $700 out, $300 kept; across six games, $6,000 in and $4,200 won by gamers.\n\n"
          + "Everything else is close to free to serve. The bot runs inside the same web application as the website, on the same deployment, with no gateway process and no always-on host; a card is rendered once and cached at a content-hashed URL that Discord's CDN then serves. The marginal cost of the ten-thousandth server is a database row.\n\n"
          + "So the model has two levers and both compound: more games sold against the same fixed prize cost, and more servers making each game worth more.",
        data: {
          bullets: [
            "$250 charged, $175 paid to players, $75 kept — per challenge, every week.",
            "Prize cost is fixed per month, not per sponsor.",
            "A new server costs a row in a table and nothing per month.",
          ],
        },
      },
      {
        kind: "tiers",
        anchor: "ladder",
        navLabel: "Server ladder",
        title: "The other side of the marketplace",
        subtitle:
          "Brands pay by the game. Servers get paid by the audience they built. Live from the product — these are the exact thresholds running in production.",
      },
      {
        kind: "ad",
        anchor: "inventory",
        navLabel: "Inventory",
        title: "The inventory, live",
        subtitle:
          "This is a real ad slot serving a real rotation. What a brand buys is this, in front of a measured gaming audience.",
        data: { placement: "investor-doc-ad-placement" },
      },
      {
        kind: "gtm",
        anchor: "gtm",
        navLabel: "Go to market",
        title: "How this compounds",
        subtitle: "Click a stage. The one we're in is marked.",
        data: {
          stages: [
            {
              name: "Build the loop",
              status: "done",
              summary: "One bot, one click, no configuration.",
              detail:
                "The product had to be worth installing before any distribution argument mattered. That meant the bot working with zero setup, every response being a rendered card rather than a wall of text, and account linking happening inside Discord — the three places comparable tools lose people.",
              bullets: [
                "24 games syncing from official APIs",
                "Cards, buttons and in-place navigation",
                "Install to first linked account with no web form",
              ],
            },
            {
              name: "Seed the servers",
              status: "current",
              summary: "Get the bot into communities that already compete.",
              detail:
                "We target servers that already run tournaments and argue about rank, because they need what we built rather than having to be convinced they do. Each install gives the owner a portal showing their growth toward sponsored challenges — which is the argument for the next server, made by someone who isn't us.",
              bullets: [
                "Direct outreach to competitive gaming servers",
                "The owner's portal as the retention and referral surface",
                "Public server pages, so each install is also a landing page",
              ],
            },
            {
              name: "Sell the challenge",
              status: "next",
              summary: "A published rate card, not a conversation.",
              detail:
                "Once enough servers cross the threshold the aggregate becomes something a brand can buy against: verified players of a named game, in communities of a known size, reachable where they already are. The rate card is public so a media buyer can qualify us in one visit instead of three meetings, and the first sponsored challenges are the case studies for the next ten.",
              bullets: [
                "Public pricing, per game, per month",
                "Audience reporting a media buyer recognises",
                "Case studies from the servers that ran them",
              ],
            },
            {
              name: "Open the network",
              status: "next",
              summary: "Servers carry each other's competitions.",
              detail:
                "At scale the network is worth more than any single server in it. Larger servers carry challenges from smaller ones and are paid to; brands sponsor across the network rather than per-community. The bot stops being a tool a server installs and becomes infrastructure the category runs on.",
              bullets: [
                "Cross-server challenges",
                "Network-wide sponsorship",
                "Publisher partnerships at the game level",
              ],
            },
          ],
        },
      },
      {
        kind: "metrics",
        anchor: "numbers",
        navLabel: "Numbers",
        title: "Everything we track",
        subtitle: "The same numbers our own team runs on, with the definition of each one attached.",
        data: {
          metricKeys: ["guilds", "guildMembers", "users", "linkedAccounts", "botCommands", "challenges", "leaderboards", "games"],
        },
      },
      {
        kind: "team",
        anchor: "team",
        navLabel: "Team",
        title: "Who's building it",
        subtitle: "Tap anyone for their background and a direct line.",
      },
      {
        kind: "faq",
        anchor: "faq",
        navLabel: "FAQ",
        title: "The questions we get asked",
        data: {
          qa: [
            {
              q: "If the opportunity is this obvious, why is it still open?",
              a: "Because it isn't one product, it's three that only work together: the game integrations that make an audience describable, the loyalty loop that makes it worth advertising to, and the revenue relationship that makes server owners want you there. Any one alone fails — a stats bot nobody monetises, an ad network with nothing verified behind it, or a rev-share deal with no product to attach it to. The work is in the combination, and it took us months.",
            },
            {
              q: "What stops Discord from building this?",
              a: "Discord builds infrastructure, not game-specific integrations — the work here is 24 separate API relationships and the normalisation between them, which is neither strategic for them nor cheap. More to the point, our value is the cross-game identity and the revenue relationship with server owners, and Discord has no interest in paying servers.",
            },
            {
              q: "What stops a competitor copying it?",
              a: "The integrations are months of work but they're not a moat on their own. The moat is the server relationships: an owner earning from us has a reason to stay, and their members' linked accounts and Cluster Points don't transfer. Whoever gets to a server first tends to keep it.",
            },
            {
              q: "How do you handle a game with no public API?",
              a: "We don't carry it. Self-reported stats would make every leaderboard and challenge worthless, and that credibility is the entire product. We'd rather cover fewer games honestly.",
            },
            {
              q: "Can the bot read messages?",
              a: "No. We do not request Discord's Message Content intent, so it is technically incapable of reading what anyone writes. It only sees the commands and buttons aimed at it. This matters to every server owner we talk to.",
            },
            {
              q: "Why publish prices instead of quoting on request?",
              a: "Because \"contact us for pricing\" costs us the brand who was ready to buy and only wanted to know whether we were a $600 or a $60,000 decision. Published pricing qualifies buyers before they take our time, and it makes the model legible to the server owners we're asking to trust it. The numbers are in the CMS, so sales can still negotiate.",
            },
            {
              q: "What are you raising, and for what?",
              a: "Ask us directly — the terms are a conversation, not a slide. What the money does is straightforward: prize pools while the first sponsors ramp, more game integrations, and the outbound effort to get the bot into the servers that should already have it.",
            },
          ],
        },
      },
      {
        kind: "contact",
        anchor: "contact",
        navLabel: "Contact",
        title: "Talk to us",
        subtitle: "We'd rather answer a hard question than send a follow-up deck.",
      },
    ],
  },

  // ===================== COMPANY PROFILE =====================
  {
    slug: "company-profile",
    kind: "profile",
    title: "ClusterGG for brands and publishers",
    subtitle: "The only structured way to advertise to gamers on Discord",
    summary:
      "Our partnership profile: why reaching gamers costs what it does, the audience we can describe, what we charge, and what a sponsored challenge actually looks like.",
    accent: "#22d3ee",
    accent2: "#f59e0b",
    contactEmail: "partners@clustergg.com",
    contactNote: "Tell us the audience you're trying to reach and we'll tell you honestly whether we have it.",
    sections: [
      {
        kind: "hero",
        anchor: "top",
        navLabel: "Overview",
        title: "Sponsor the competition, not the impression.",
        subtitle:
          "Every gamer is on Discord and there is no ads manager to reach them with. Cluster is the way in: placements across a network of gaming communities, and weekly challenges that carry your name into the servers where the players actually are.",
        data: {
          badge: "For brands, agencies and publishers",
          ctaLabel: "See what it costs",
          ctaHref: "#pricing",
        },
      },
      {
        kind: "explainer",
        anchor: "why",
        navLabel: "Why here",
        title: "Three expensive ways to miss gamers. And one door with no handle.",
        subtitle: "Esports sponsorship, social ads, or DMing big servers yourself. Each makes you pay for the people who aren't gamers.",
        data: {
          steps: [
            { icon: "trophy", label: "Esports costs six figures", note: "One weekend, one city, and the reach is the fans who could afford a ticket plus the stream viewers who muted your bumper." },
            { icon: "monitor", label: "Social sells you the break", note: "Meta and TikTok reach a gamer on their phone between two matches. They scroll past on the way back to the lobby — and you paid for every impression that missed." },
            { icon: "lock", label: "Discord has no ads manager", note: "Where they actually spend their time, there is nothing to buy. No targeting, no pixel, no self-serve. Brands that know this end up negotiating with one server at a time." },
            { icon: "shield", label: "So we built the buy", note: "Placements across every community running our bot, and sponsored challenges in the games you choose — with every player verified against that game's own API." },
          ],
        },
      },
      {
        kind: "traction",
        anchor: "audience",
        navLabel: "The audience",
        title: "What we can reach today",
        subtitle: "Live from production. If a number here is too small for your campaign, we'd rather you knew now.",
      },
      {
        kind: "servers",
        anchor: "communities",
        navLabel: "Communities",
        title: "The communities",
        subtitle: "Real servers, real member counts, each with a public page.",
      },
      {
        kind: "explainer",
        anchor: "activations",
        navLabel: "Activations",
        title: "What we can run for you.",
        data: {
          steps: [
            { icon: "trophy", label: "Sponsored challenge", note: "Your name on the weekly competition for a game you choose — scored from the game's own API, with the prize pool funded and paid by us." },
            { icon: "send", label: "Network placement", note: "Your creatives across clustergg.com and inside every opted-in community, swapped by you from the brand portal whenever you want." },
            { icon: "planet", label: "Game world takeover", note: "A game's whole planet in your colours: its leaderboards, its challenges, its landing page." },
            { icon: "play", label: "Sunday broadcast", note: "Presenting sponsor of the live Profile of the Week final, on the winners card posted to every server, and named in every clip cut from it." },
          ],
        },
      },
      {
        kind: "pricing",
        anchor: "pricing",
        navLabel: "Pricing",
        title: "What it costs",
        subtitle:
          "Published, not quoted on request. Read live as this page loads, so what you see here is what we are charging today.",
      },
      {
        kind: "product",
        anchor: "product",
        navLabel: "The product",
        title: "What your activation sits inside",
        subtitle: "Press a button — this is what a member sees when your challenge lands in their server.",
        data: { focus: "challenges" },
      },
      {
        kind: "showcase",
        anchor: "surfaces",
        navLabel: "Your surfaces",
        title: "Where your brand can land.",
        subtitle: "Every one drawn live, in your colours if you want them.",
        data: {
          cards: [
            { kind: "challenge", caption: "A sponsored challenge — your name on the competition" },
            { kind: "planet", caption: "A game world you can take over entirely" },
            { kind: "profile", caption: "The gamer profile your audience builds and shares" },
            { kind: "leaderboard", caption: "A leaderboard your campaign can own" },
          ],
        },
      },
      {
        kind: "ad",
        anchor: "placements",
        navLabel: "Placements",
        title: "A live placement",
        subtitle:
          "Serving right now, from the same rotation engine your creative would run in. What you see is what you'd get.",
        data: { placement: "investor-doc-ad-placement" },
      },
      {
        kind: "gtm",
        anchor: "how",
        navLabel: "How it works",
        title: "From conversation to live campaign",
        subtitle: "Click any stage.",
        data: {
          stages: [
            {
              name: "Scope",
              status: "done",
              summary: "You tell us the audience. We tell you if we have it.",
              detail:
                "We start by checking your target against what we can actually verify — the game, the size, the communities. If the answer is that we're too small for what you need, you get that answer in the first conversation rather than the third.",
              bullets: ["Audience check against live data", "Honest coverage answer up front", "No proposal until the numbers support one"],
            },
            {
              name: "Design",
              status: "current",
              summary: "Build the activation around what the community already does.",
              detail:
                "The activations that work are the ones a community would have wanted anyway — a competition on the game they play, with a prize that means something. We design around that rather than inserting a message into it, because the second kind gets muted.",
              bullets: ["Challenge format and scoring", "Prize structure and trophies", "Which communities it runs in"],
            },
            {
              name: "Run",
              status: "next",
              summary: "It goes live in the servers, with the bot doing the work.",
              detail:
                "Your challenge appears in each participating server as a card members can enter with one tap. Standings move on verified data throughout. Nothing needs a moderator to maintain it.",
              bullets: ["One-tap entry inside Discord", "Live standings from game APIs", "Automatic trophy distribution"],
            },
            {
              name: "Report",
              status: "next",
              summary: "What happened, per community, with the numbers behind it.",
              detail:
                "Reach, entrants, completion, and the placement performance alongside it — reported per community so you can see which audiences responded and buy better next time.",
              bullets: ["Per-community breakdown", "Entrants and completion", "Placement impressions and clicks"],
            },
          ],
        },
      },
      {
        kind: "metrics",
        anchor: "numbers",
        navLabel: "Numbers",
        title: "What we report on",
        subtitle: "The same measurements we run the company on, with each definition attached.",
        data: { metricKeys: ["guilds", "guildMembers", "linkedAccounts", "games", "challenges", "adImpressions", "adClicks"] },
      },
      {
        kind: "logos",
        anchor: "games",
        navLabel: "Games",
        title: "Games we sync",
        subtitle: "Every one of these is an official API integration, not a scrape.",
        data: { logos: [] },
      },
      {
        kind: "team",
        anchor: "team",
        navLabel: "Team",
        title: "Who you'd be working with",
        subtitle: "Tap anyone for their background and a direct line.",
      },
      {
        kind: "faq",
        anchor: "faq",
        navLabel: "FAQ",
        title: "What partners ask",
        data: {
          qa: [
            {
              q: "How do you verify that someone plays the game?",
              a: "They link the account, and we read it from the game's official API — rank, matches, wins. Nothing is self-reported, and a member can't inflate what they haven't played.",
            },
            {
              q: "Do members find sponsored challenges intrusive?",
              a: "The ones designed as competitions don't get treated as ads, because they aren't — a member enters to win something on the game they already play. What does get muted is a message inserted into a community that didn't want it, which is why we don't run those.",
            },
            {
              q: "Can we sponsor inside our own Discord?",
              a: "Yes, and it's often the better version. We install the bot in your server, build the competitive layer, and run the activation for your existing community rather than renting someone else's.",
            },
            {
              q: "What reporting do we get?",
              a: "Reach, entrants, completion and placement performance, broken down per community. Everything is counted directly rather than modelled.",
            },
            {
              q: "Who pays the prize money?",
              a: "We do. Every sponsored challenge carries a guaranteed minimum pool that Cluster funds and pays out to the winners. You are buying the competition and the name on it — not the administration, and not the risk of a prize going unpaid.",
            },
            {
              q: "What does naming rights actually mean?",
              a: "The weekly challenge for that game runs under your brand: on the card the bot posts into every server, on the leaderboard, on the challenge page, and in the winners announcement. It is the competition the community was going to enter anyway, carrying your name.",
            },
            {
              q: "What's the minimum?",
              a: "One month, and the entry price is the placements-only tier. Annual is discounted because it helps us plan prize pools. Nothing is a lock-in and the full rate card is above.",
            },
          ],
        },
      },
      {
        kind: "contact",
        anchor: "contact",
        navLabel: "Contact",
        title: "Start a conversation",
        subtitle: "Tell us the audience you want. We'll tell you what we can honestly deliver.",
      },
    ],
  },
];

// Four founders, editable to any number afterwards. Deliberately generic —
// these are placeholders for real people, and a placeholder that reads like a
// real bio is worse than one that obviously needs filling in.
export const SEED_PEOPLE: {
  name: string; role: string; bio: string; email: string; logos: { name: string }[];
}[] = [
  {
    name: "Founder One",
    role: "Co-founder & CEO",
    bio: "Replace this with a real bio in Admin → Data room → Team. Two or three sentences on what they've built before and why they're the right person for this problem works better than a list of titles.",
    email: "founders@clustergg.com",
    logos: [{ name: "Previous company" }, { name: "Previous company" }],
  },
  {
    name: "Founder Two",
    role: "Co-founder & CTO",
    bio: "Replace this in Admin → Data room → Team. Add their photo, the logos of where they've worked, and a direct email — investors open this modal to find a person, not a paragraph.",
    email: "founders@clustergg.com",
    logos: [{ name: "Previous company" }, { name: "Previous company" }],
  },
  {
    name: "Founder Three",
    role: "Head of Partnerships",
    bio: "Replace this in Admin → Data room → Team. For a partnerships lead, the useful thing is which brands or publishers they've actually shipped work with.",
    email: "partners@clustergg.com",
    logos: [{ name: "Previous company" }],
  },
  {
    name: "Founder Four",
    role: "Head of Community",
    bio: "Replace this in Admin → Data room → Team. For a community lead, name the communities — size and game are what a reader is trying to work out.",
    email: "community@clustergg.com",
    logos: [{ name: "Previous company" }],
  },
];
