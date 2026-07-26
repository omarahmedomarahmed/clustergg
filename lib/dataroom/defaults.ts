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
    subtitle: "The engagement layer for Discord gaming communities",
    summary:
      "Our investor deck: what Cluster is, the traction behind it, how it makes money, and where it goes next — with every number read live from production.",
    accent: "#8b5cf6",
    accent2: "#22d3ee",
    contactEmail: "founders@clustergg.com",
    contactNote: "We reply to everything. Ask for the data you want and we'll open it.",
    sections: [
      {
        kind: "hero",
        anchor: "top",
        navLabel: "Overview",
        title: "Gaming communities live on Discord. Nothing measures them.",
        subtitle:
          "Cluster is a Discord bot that turns a server's members into ranked, verified gamers — then turns that measured audience into revenue the server shares.",
        data: {
          badge: "Pre-seed · live product",
          ctaLabel: "See the live product",
          ctaHref: "#product",
        },
      },
      {
        kind: "text",
        anchor: "problem",
        navLabel: "Problem",
        title: "The audience is enormous and completely illegible.",
        body:
          "Hundreds of millions of gamers organise themselves into Discord servers. Those servers are where games are actually discussed, played and bought — and they are invisible to everyone who would pay to reach them.\n\nA brand that wants gamers buys Twitch or YouTube, where it rents attention it cannot verify. A server owner with 40,000 members has no way to prove what those members play, so they monetise with a $5 subscription tier or not at all. And the members themselves have their identity scattered across a dozen games with nothing that carries between them.\n\nEveryone in that triangle loses to the same missing thing: nobody can measure a Discord community.",
        data: {
          bullets: [
            "Server owners have reach they can't prove and therefore can't sell.",
            "Brands buy creators because communities aren't purchasable.",
            "Gamers rebuild their identity from scratch in every game they play.",
          ],
        },
      },
      {
        kind: "text",
        anchor: "solution",
        navLabel: "Solution",
        title: "Measure the community by making the measurement worth having.",
        body:
          "Cluster's bot installs in one click and gives every member something they want: a ranked profile with live stats pulled from the games they already play, Cluster Points that accumulate across all of them, and challenges with real, redeemable trophies.\n\nThey link a game account to get it. That link is the measurement — it's verified against the game's own API, so it can't be inflated, and it tells us exactly what that community plays.\n\nA server that reaches 500 linked members unlocks a share of the ad revenue Cluster earns from it. The owner's incentive is now to recruit for us, and the thing they're recruiting toward is the thing that makes the audience sellable.",
        data: {
          bullets: [
            "One click to install, nothing to configure, no permission to read messages.",
            "Stats come from official game APIs — League, Valorant, Apex, CS2, Fortnite and 19 more.",
            "The bot never asks a member to leave Discord, which is where every competitor loses them.",
          ],
        },
      },
      {
        kind: "product",
        anchor: "product",
        navLabel: "Product",
        title: "This is the product, running.",
        subtitle: "Not a screenshot. These are live cards from our renderer — press a button and it behaves exactly as it does in a server right now.",
        data: { focus: "bot" },
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
        kind: "text",
        anchor: "business",
        navLabel: "Business model",
        title: "We sell a measured audience, and pay the people who built it.",
        body:
          "Revenue is advertising and sponsored competition, sold against an audience we can describe precisely: this many verified players of this game, in communities of this size.\n\nServers keep a share. That is not generosity — it is the acquisition channel. A server owner who earns from us recruits for us, and their recruiting is more credible than any ad we could buy.\n\nThe cost side is deliberately thin: the bot runs inside the same web application as the site, with no gateway process and no always-on host, so a new server costs us close to nothing to serve.",
        data: {
          bullets: [
            "Advertising against verified gaming audiences.",
            "Sponsored challenges — a brand's name on a competition the community actually enters.",
            "Server revenue share, which is the growth engine rather than a cost line.",
          ],
        },
      },
      {
        kind: "tiers",
        anchor: "ladder",
        navLabel: "Server ladder",
        title: "What a server climbs toward",
        subtitle: "Live from the product — these are the exact thresholds running in production.",
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
                "We target servers that already run tournaments and argue about rank, because they need what we built rather than having to be convinced they do. Each install gives the owner a portal showing their growth toward revenue share — which is the argument for the next server, made by someone who isn't us.",
              bullets: [
                "Direct outreach to competitive gaming servers",
                "The owner's portal as the retention and referral surface",
                "Public server pages, so each install is also a landing page",
              ],
            },
            {
              name: "Prove the audience",
              status: "next",
              summary: "Turn linked accounts into a sellable description.",
              detail:
                "Once enough servers cross the threshold, the aggregate becomes something a brand can buy against: verified players of a named game, in communities of a known size, reachable in the place they already are. The first sponsored challenges are how we price it.",
              bullets: [
                "Sponsored challenges as the first paid product",
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
              q: "What are you raising, and for what?",
              a: "Ask us directly — the terms are a conversation, not a slide. What the money does is straightforward: more game integrations, and the outbound effort to get the bot into the servers that should already have it.",
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
    subtitle: "Reach gaming communities where they actually are — measured, verified and sponsorable",
    summary:
      "Our partnership profile: the audience we can describe, the activations we run inside Discord communities, and what a sponsored challenge actually looks like.",
    accent: "#22d3ee",
    accent2: "#f59e0b",
    contactEmail: "partners@clustergg.com",
    contactNote: "Tell us the audience you're trying to reach and we'll tell you honestly whether we have it.",
    sections: [
      {
        kind: "hero",
        anchor: "top",
        navLabel: "Overview",
        title: "Sponsor the community, not the impression.",
        subtitle:
          "Cluster runs inside Discord gaming communities and knows what their members play — because every stat is verified against the game's own API. That makes an audience you can buy against rather than hope for.",
        data: {
          badge: "For brands, agencies and publishers",
          ctaLabel: "See what an activation looks like",
          ctaHref: "#activations",
        },
      },
      {
        kind: "text",
        anchor: "why",
        navLabel: "Why Discord",
        title: "The room the audience is already in.",
        body:
          "Gaming attention moved from forums to Discord and nothing followed it. Media buying still routes through creators, where you rent someone else's audience for the length of a video and inherit whatever their comment section does that week.\n\nA Discord community is the opposite: persistent, self-selected, and organised around exactly the game you care about. The reason nobody sells it is that nobody could describe it — until the members' accounts are linked and verified.\n\nThat's the only thing Cluster does that matters to you. We can tell you how many verified players of your game are reachable, in communities of what size, and put your activation in front of them without anyone leaving the app.",
        data: {
          bullets: [
            "Persistent audiences rather than a video's half-life.",
            "Verified play, not declared interest.",
            "Activations that happen in the community, not adjacent to it.",
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
        kind: "text",
        anchor: "activations",
        navLabel: "Activations",
        title: "What we can actually run for you",
        body:
          "Everything below happens inside the community, uses the same verified data the members already trust, and produces a result you can report on.",
        data: {
          bullets: [
            "Sponsored challenges — your brand on a competition members enter with their real accounts, scored on live data, with trophies you fund and we distribute.",
            "Game activations — a campaign scoped to one title, reaching only the communities and members who verifiably play it.",
            "Community building — we set up, populate and run the competitive layer of your own Discord, using the same bot the network runs on.",
            "Brand exposure — rotating placements across the network's cards, pages and channels, reported per placement.",
            "Publisher partnerships — a planet for your game with its own leaderboards, quests and challenges, and the audience that follows.",
          ],
        },
      },
      {
        kind: "product",
        anchor: "product",
        navLabel: "The product",
        title: "What your activation sits inside",
        subtitle: "The live bot. Press a button — this is what a member sees when your challenge lands in their server.",
        data: { focus: "challenges" },
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
              q: "What's the minimum?",
              a: "There isn't a rate card yet — we're early enough that the first campaigns are priced as conversations. That cuts both ways and we'd rather say so.",
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
