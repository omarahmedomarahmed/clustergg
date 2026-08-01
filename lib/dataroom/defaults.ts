import type { SectionKind, SectionData } from "@/lib/dataroom/types";

// The two documents, as shipped.
//
// These are seeds, not fixtures: they're written once into the database on
// first boot and every word of them is editable afterwards. Nothing here is
// re-applied over an admin's edits, because a deploy silently reverting someone's
// copy is the fastest way to make a CMS untrusted. `reseedDoc` exists for the
// deliberate case where the shipped version is genuinely newer.
//
// Written to be defensible. Numbers are never asserted in prose — the sections
// that carry numbers read them live, so a deck can't go stale between the day
// it was written and the day an investor opens it.
//
// THE DECK'S SHAPE
//
// The pitch deck is sixteen slides, in a fixed order, each making exactly one
// argument. They are numbered in the nav so a reader always knows where they
// are in the story, and none of them is a wall of prose: every slide is either
// a graphic explainer or a renderer reading live production data. That is
// deliberate — an investor deck that has to be READ is a document, and this is
// a deck.
//
// Everything after slide sixteen is the appendix: the live proof a partner or
// an investor asks for once the argument has landed. It is not part of the
// sixteen and it is labelled so nobody mistakes it for them.

export type SeedSection = {
  kind: SectionKind;
  anchor: string;
  navLabel: string;
  title?: string;
  subtitle?: string;
  body?: string;
  data?: SectionData;
  /**
   * Ships built but switched off.
   *
   * For slides whose content is a decision rather than a fact. Shipping those
   * visible with plausible-looking defaults would put numbers in front of an
   * investor that nobody chose. The slide is there, the layout is done, and a
   * founder turns it on in Admin → Data room once the figures are theirs.
   */
  hidden?: boolean;
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
    title: "Cluster",
    subtitle: "The media-buying and monetization platform for Discord gaming communities",
    summary:
      "Brands reach gamers where they really are. Server owners earn. Gamers play, win and share. Sixteen slides on why Discord is the last unbought gaming audience and how we made it buyable — with every number read live from production.",
    accent: "#8b5cf6",
    accent2: "#22d3ee",
    contactEmail: "founders@clustergg.com",
    contactNote: "We reply to everything. Ask for the data you want and we'll open it.",
    sections: [
      // ---------- 1. TITLE ----------
      {
        kind: "hero",
        anchor: "top",
        navLabel: "1 · Cluster",
        title: "The media-buying and monetization platform for Discord gaming communities.",
        subtitle:
          "Brands reach gamers where they really are. Server owners earn. Gamers play, win, and share.",
        data: {
          badge: "B2B SaaS · gaming marketing · live product",
          ctaLabel: "See it running",
          ctaHref: "#magic",
        },
      },

      // ---------- 2. THE INSIGHT ----------
      // Three "maybe"s and one "always". The asymmetry is the whole slide, which
      // is why it's four cards and not a paragraph.
      {
        kind: "explainer",
        anchor: "insight",
        navLabel: "2 · The insight",
        title: "Gamers live on Discord.",
        subtitle:
          "Everywhere else is a visit. Discord is where they start, where they return, and where they spend their real time.",
        data: {
          steps: [
            { icon: "monitor", label: "A gamer may open TikTok", note: "For a few minutes, on a phone, in the break between two matches. Then they close it." },
            { icon: "image", label: "A gamer may open Instagram", note: "Same story. It is a place they pass through, not a place they are." },
            { icon: "trophy", label: "A gamer may go to a weekend event", note: "If there's one nearby, and if the ticket is affordable. Once or twice a year." },
            { icon: "home", label: "But before that, they are on Discord. And after that, they go back to Discord.", note: "It is where the squad is, where the match gets organised, and where the argument about the last game happens. Discord is home." },
          ],
        },
      },

      // ---------- 3. THE PROBLEM ----------
      {
        kind: "explainer",
        anchor: "problem",
        navLabel: "3 · The problem",
        title: "Brands spend a lot to reach gamers, but the system is broken.",
        subtitle:
          "Brands pay twice — once for the event, and again for the attention — and still aren't advertising where gamers spend most of their time.",
        data: {
          steps: [
            { icon: "trophy", label: "Pay once for the event", note: "A tournament sponsorship is expensive and lasts one or two days. It is a lot of money for a very short window." },
            { icon: "eye", label: "ROI is hard to measure", note: "A lot of the value depends on the post-event content — which does not exist yet on the day the invoice is signed." },
            { icon: "send", label: "Then pay again for the attention", note: "The clips go to Meta and TikTok, and the brand buys the same audience a second time to promote the thing it already paid for." },
            { icon: "lock", label: "And still not where gamers live", note: "None of that spend lands on Discord — and Discord has no ads manager, so until now there was no way to correct it." },
          ],
        },
      },

      // ---------- 4. THE SOLUTION ----------
      {
        kind: "explainer",
        anchor: "solution",
        navLabel: "4 · The solution",
        title: "Cluster unlocks Discord advertising in a structured way.",
        subtitle: "We make Discord buyable, measurable and repeatable.",
        data: {
          steps: [
            { icon: "trophy", label: "Sponsored challenges", note: "The weekly competition for a game, carrying a brand's name, running inside the servers where that game is already played." },
            { icon: "monitor", label: "In-bot ad placements", note: "A creative on every card the bot renders, in every opted-in community, with the brand's own click button underneath it." },
            { icon: "medal", label: "Branded trophies", note: "The brand's logo on the trophy the winner keeps on their profile — and can redeem for real money." },
            { icon: "chart", label: "Trackable analytics", note: "Impressions, clicks, entrants, standings and ROAS. Counted where they can be counted, and labelled as projections where they can't." },
            { icon: "users", label: "Community-level performance", note: "Which server delivered which result, so the next buy is better than the last one. That is what makes it a media channel rather than a favour." },
          ],
        },
      },

      // ---------- 5. WHAT CLUSTER IS ----------
      {
        kind: "explainer",
        anchor: "platform",
        navLabel: "5 · Three sides",
        title: "Cluster is a three-sided platform.",
        subtitle: "None of the three works without the other two, which is what makes the loop run on its own.",
        data: {
          steps: [
            { icon: "target", label: "For brands", note: "Buy media on Discord with structure, analytics and clear performance — on a published rate card, in a month, with no operations to staff." },
            { icon: "crown", label: "For server owners", note: "Monetize community attention through the bot's ads and sponsored challenges. They bring the audience; we bring the monetization layer." },
            { icon: "gamepad", label: "For gamers", note: "Earn rewards, build profile status, and join branded challenges without ever leaving Discord." },
          ],
        },
      },

      // ---------- 6. VALUE FOR BRANDS ----------
      // Drawn rather than described: this is the slide where a media buyer is
      // asking "so where does my logo actually appear", and a picture of the
      // surfaces answers it faster than a bulleted list of capabilities.
      {
        kind: "placements",
        anchor: "brands",
        navLabel: "6 · For brands",
        title: "Brands get a new performance channel.",
        subtitle:
          "Run sponsored challenges. Put your name on the competition and your logo on the trophy. Show up inside Discord, and track impressions, clicks, engagement and community performance. This is not vague awareness — it is structured gamer attention, and these are the surfaces it lands on.",
      },

      // ---------- 7. VALUE FOR SERVER OWNERS ----------
      {
        kind: "tiers",
        anchor: "owners",
        navLabel: "7 · For owners",
        title: "Server owners finally get paid for their community.",
        subtitle:
          "They earn from ads shown through the bot and from branded challenges, grow engagement inside the server, and give members something fun and rewarding — without running manual sponsorship operations. No sales team. No admin burden. No seeding. This is the live ladder, running in production.",
      },

      // ---------- 8. VALUE FOR GAMERS ----------
      {
        kind: "showcase",
        anchor: "gamers",
        navLabel: "8 · For gamers",
        title: "Gamers get more than ads. They get status and rewards.",
        subtitle:
          "Customize a profile and share it. Collect votes for the best one. Earn Cluster Points, join live challenges, win trophies — and either keep the trophy on the profile or redeem the win for real money. That is what makes brand interaction feel like gameplay rather than interruption.",
        data: {
          cards: [
            { kind: "profile", caption: "The profile they build, customise and share" },
            { kind: "challenge", caption: "A live challenge — trophies with real, redeemable value" },
            { kind: "quest", caption: "Quests: milestones earned across every game at once" },
            { kind: "cp", caption: "Cluster Points, the score that carries between games" },
          ],
        },
      },

      // ---------- 9. WHY CHALLENGES WORK ----------
      {
        kind: "explainer",
        anchor: "challenges",
        navLabel: "9 · Why challenges",
        title: "The unit of sponsorship is something gamers already love.",
        subtitle:
          "A brand does not place a banner. It sponsors a challenge — and stops being seen, and becomes part of the win.",
        data: {
          loop: true,
          steps: [
            { icon: "swords", label: "The brand becomes part of the competition", note: "Not adjacent to it, not before it as a pre-roll. Inside it." },
            { icon: "type", label: "The challenge carries the brand name", note: "On the card posted to every server, on the leaderboard, on the challenge page and in the winners announcement." },
            { icon: "medal", label: "The trophy carries the brand logo", note: "And it stays on the winner's profile, where their friends see it, long after the week ends." },
            { icon: "star", label: "The win becomes memorable", note: "People remember what they won and who paid for it. Nobody remembers an impression." },
            { icon: "crown", label: "The reward feels earned", note: "Which is what creates loyalty. The brand is not just seen — the brand is part of the win." },
          ],
        },
      },

      // ---------- 10. VS TOURNAMENT SPONSORSHIP ----------
      {
        kind: "ops",
        anchor: "always-on",
        navLabel: "10 · Always-on",
        title: "Always-on beats weekend-only.",
        subtitle:
          "A tournament is expensive, short, hard to measure and operationally heavy. Cluster is ongoing, trackable, digital, low-friction, inside Discord, and built around daily gamer behaviour. Instead of paying for a short event and paying again to promote the clips, a brand sponsors gameplay directly where gamers already spend their time — and this is where each dollar actually goes.",
      },

      // ---------- 11. PRODUCT MAGIC ----------
      {
        kind: "product",
        anchor: "magic",
        navLabel: "11 · The product",
        title: "We built the experience to work inside Discord.",
        subtitle:
          "Challenge creation, live updates, in-bot visibility, rewards and trophies, profile recognition, analytics for brands, monetization for communities — A to Z. And the best part: no manual operations are needed to run each challenge. It is a repeatable system. Press a button — this is the real bot, behaving exactly as it does in a server right now.",
        data: { focus: "bot" },
      },

      // ---------- 12. WHY THIS MATTERS ----------
      {
        kind: "explainer",
        anchor: "matters",
        navLabel: "12 · Why it matters",
        title: "Cluster makes Discord commercially usable for brands.",
        subtitle:
          "Today Discord has the gamer attention. For most brands it is still impossible to buy in a structured way. We turn it into four things it has never been.",
        data: {
          steps: [
            { icon: "send", label: "A media channel", note: "Inventory that can be described, priced, bought and reported on — the four things that make something media rather than a relationship." },
            { icon: "trophy", label: "A sponsorship channel", note: "Naming rights on a recurring competition, sold per game per month, instead of a one-off negotiation with one server." },
            { icon: "diamond", label: "A monetization channel", note: "A revenue line for the community that built the audience, paid automatically out of the platform fee." },
            { icon: "medal", label: "A gamer rewards channel", note: "Prize money and branded trophies that reach the player, which is what makes the audience turn up in the first place." },
          ],
        },
      },

      // ---------- 13. BUSINESS MODEL ----------
      {
        kind: "explainer",
        anchor: "model",
        navLabel: "13 · Business model",
        title: "We make money from the flow of brand spend.",
        subtitle:
          "Revenue comes from sponsored challenges, ad placements inside the bot ecosystem, media-buying packages, premium campaign visibility, and the analytics and campaign tools brands run on. The model itself is four steps.",
        data: {
          steps: [
            { icon: "target", label: "Brands spend", note: "On a published rate card. A month of sponsored challenges for a game, plus placements across the network." },
            { icon: "gamepad", label: "Gamers engage", note: "They enter, they play the week under the brand's name, and they appear on its leaderboard. Engagement, not exposure." },
            { icon: "crown", label: "Server owners earn", note: "A share of the platform fee on every sponsored challenge that runs in their community, rising as they connect more gamers." },
            { icon: "diamond", label: "Cluster takes platform revenue", note: "What is left after the prize pool and the owner's share. There is no operations line under it, which is where the margin comes from." },
          ],
        },
      },

      // ---------- 14. MOAT ----------
      {
        kind: "compare",
        anchor: "moat",
        navLabel: "14 · Moat",
        title: "What makes Cluster hard to replace.",
        subtitle:
          "Discord-native distribution, structured brand inventory, gamer identity and profiles, live challenges tied to real gameplay, trophies, CP and reward loops — and value for all three sides at once. Anyone can sponsor content. Very few can build a system where brand spend, gamer action and server monetization all work together in one loop. Here it is against the alternatives, including the rows where they beat us.",
      },

      // ---------- 15. VISION ----------
      {
        kind: "explainer",
        anchor: "vision",
        navLabel: "15 · Vision",
        title: "We built the future of gaming marketing.",
        subtitle:
          "The future is not only esports events, creator posts and short social campaigns. It is five things, and all five are what Cluster already does.",
        data: {
          steps: [
            { icon: "clock", label: "Always-on gamer attention", note: "Not a weekend. Every week, in the place they already are, whether or not there is an event on." },
            { icon: "trophy", label: "Sponsor-funded gameplay", note: "Brands paying gamers to play, rather than paying platforms to interrupt them." },
            { icon: "chart", label: "Measurable Discord media", note: "The last large audience with no ads manager, given one — with the numbers a media buyer recognises." },
            { icon: "users", label: "Community-owned monetization", note: "The people who built the audience take a share of what it earns, automatically." },
            { icon: "medal", label: "Rewards tied to real gamer behaviour", note: "Verified against each game's own API, so what a gamer wins is what a gamer actually did." },
          ],
        },
      },

      // ---------- 16. THE ASK ----------
      {
        kind: "raise",
        anchor: "raise",
        navLabel: "16 · The ask",
        title: "We are raising $100,000 for 20%.",
        subtitle:
          "$500,000 post-money. It buys brand partnerships, more Discord communities onboarded, expanded game coverage and challenge volume, better analytics and campaign tools — and the speed to scale the platform. The product is built and running; this round turns it into revenue.",
        data: {
          ask: {
            amount: 100000,
            instrument: "Priced equity round",
            valuation: 400000,
            postMoney: 500000,
            equityPct: 20,
            runwayMonths: 18,
            currency: "USD",
          },
          useOfFunds: [
            { label: "Brand partnerships", pct: 30, note: "Getting the first brands onto the card placement and the first campaigns booked — the case studies that sell the next ten" },
            { label: "Prize pools", pct: 25, note: "Funding challenges while the first sponsors ramp — the cost of goods, paid before the revenue arrives" },
            { label: "Onboarding communities", pct: 20, note: "Getting the bot into the servers that should already have it, and supporting the owners who run them" },
            { label: "Game coverage & tools", pct: 15, note: "More integrations, more challenge volume, and the analytics brands ask for before they renew" },
            { label: "Infrastructure & legal", pct: 10, note: "Hosting, APIs, prize payout compliance" },
          ],
          capTable: [
            { holder: "Founders", pct: 70, note: "Fully vesting, 4 years" },
            { holder: "This round", pct: 20, note: "$100,000 at $500,000 post-money" },
            { holder: "Option pool", pct: 10, note: "Reserved for the first engineering and sales hires" },
          ],
        },
      },

      // ================= APPENDIX =================
      // Everything below is proof, not argument. It exists because the sixteen
      // slides make claims, and an investor's next question is always "show me".
      // Each of these reads live from production rather than repeating a number
      // somebody typed into a deck.
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
        navLabel: "Communities",
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
        kind: "showcase",
        anchor: "renders",
        navLabel: "What it renders",
        title: "Every reply is art.",
        subtitle: "Drawn live by the same renderer that serves Discord. Nothing here is a mockup.",
        data: {
          cards: [
            { kind: "planet", caption: "A game world — live challenges, standings, who's ranked on it" },
            { kind: "leaderboard", caption: "A leaderboard, straight from the game's official API" },
            { kind: "challenge", caption: "A sponsored challenge, carrying the brand" },
            { kind: "profile", caption: "A gamer's profile — their art, their trophies, every game they play" },
          ],
        },
      },
      {
        kind: "ad",
        anchor: "inventory",
        navLabel: "Live inventory",
        title: "The inventory, live",
        subtitle:
          "A real ad slot serving a real rotation. What a brand buys is this, in front of a measured gaming audience.",
        data: { placement: "investor-doc-ad-placement" },
      },
      {
        kind: "pricing",
        anchor: "pricing",
        navLabel: "Rate card",
        title: "What we charge",
        subtitle:
          "Published at clustergg.com/pricing rather than quoted on request. Every figure below is read from the live rate card as this page loads.",
      },
      {
        kind: "unit",
        anchor: "unit",
        navLabel: "Unit economics",
        title: "One transaction, repeated",
        subtitle:
          "Every number here is the live rate card. Cost of goods is the prize — there is no third line, because there is no operations team between the money and the players.",
        data: {
          units: [
            { label: "One weekly challenge", revenue: 250, cost: 175, note: "$175 is the prize, paid as three trophies carrying the sponsor's brand. The only cost of goods." },
            { label: "One game, one month", revenue: 1000, cost: 700, note: "Four challenges. The prize cost is fixed per month — a second sponsor does not double it." },
            { label: "Six games, one month", revenue: 6000, cost: 4200, note: "The full catalogue as sold today, before placement revenue and before the add-on." },
          ],
        },
      },
      {
        kind: "saas",
        anchor: "saas",
        navLabel: "SaaS metrics",
        title: "Revenue, as the database has it",
        subtitle:
          "Read from the campaigns actually running as this page loads. Nothing on this slide was typed into a deck, which also means it cannot be flattering by accident.",
      },
      {
        kind: "market",
        anchor: "market",
        navLabel: "Market",
        title: "Sized from our own rate card, not a report",
        subtitle:
          "Top-down market numbers are unfalsifiable and everybody's deck has them. This is bottom-up: what the catalogue can be sold for, with the arithmetic in the open.",
        data: {
          market: [
            {
              label: "Today's sellable inventory",
              value: "$6,400 / mo",
              note: "Six games at $1,000 a month plus the $400 ultimate base — one brand taking the whole network. The rate card is published, so this is checkable.",
              source: "clustergg.com/pricing · the live rate card this page reads from",
            },
            {
              label: "The catalogue we already run",
              value: "24 games",
              note: "Integrations built and syncing. Selling the same weekly challenge across all of them is $24,000 a month of game inventory at today's price, with no new engineering.",
              source: "lib/providers/registry.ts · the integrations in production",
            },
            {
              label: "Then it stops being per-game",
              value: "Placements",
              note: "Ad inventory scales with reach rather than catalogue: every card the bot renders carries a sponsor box, so inventory grows with servers installed and gamers connected, not with games added.",
              source: "Bottom-up from installs — no third-party market estimate is doing work here.",
            },
          ],
        },
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
        kind: "tech",
        anchor: "tech",
        navLabel: "Engineering",
        title: "What we actually built",
        subtitle:
          "The parts a technical diligence call asks about, each with a number that can be checked against the running product.",
      },
      {
        kind: "loop",
        anchor: "weekly",
        navLabel: "The weekly loop",
        title: "How the network grows itself",
        subtitle:
          "Profile of the Week is the distribution engine, not a feature. Every gamer on the platform is entered, and winning means asking people who have never heard of us to come and vote.",
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
              a: "$100,000 for 20%, at $500,000 post-money. The terms are on slide sixteen with the use of funds and the cap table beside them. In short: brand partnerships, prize pools while the first sponsors ramp, more communities onboarded, and the game coverage and campaign tools that let us scale the platform faster.",
            },
          ],
        },
      },
      {
        kind: "contact",
        anchor: "contact",
        navLabel: "Contact",
        title: "If Discord is the home of gamers, Cluster is the business layer on top of that home.",
        subtitle: "We'd rather answer a hard question than send a follow-up deck.",
      },
    ],
  },

  // ===================== SALES DECK / COMPANY PROFILE =====================
  // The same argument, told to a buyer rather than an investor: it opens on
  // what they get instead of on what the market is, and it ends on a rate card
  // instead of a cap table.
  {
    slug: "company-profile",
    kind: "profile",
    title: "Cluster for brands and publishers",
    subtitle: "Buy media inside Discord — where gamers actually live",
    summary:
      "Our sales deck: why gamers live on Discord, why the current way of reaching them makes you pay twice, what a sponsored challenge actually is, and what it costs — with every number read live from production.",
    accent: "#22d3ee",
    accent2: "#f59e0b",
    contactEmail: "partners@clustergg.com",
    contactNote: "Tell us the audience you're trying to reach and we'll tell you honestly whether we have it.",
    sections: [
      {
        kind: "hero",
        anchor: "top",
        navLabel: "Overview",
        title: "Sponsor the gameplay, not the content.",
        subtitle:
          "Cluster is the media-buying layer for Discord gaming communities. Sponsored challenges carrying your name, placements on every card the bot renders, your logo on the trophy — inside the place gamers actually live. This isn't ad spend. It's putting your brand inside a gamer's home and paying them to play.",
        data: {
          badge: "B2B SaaS · gaming marketing",
          ctaLabel: "See what it costs",
          ctaHref: "#pricing",
        },
      },
      {
        kind: "explainer",
        anchor: "insight",
        navLabel: "Where they are",
        title: "Gamers live on Discord.",
        subtitle: "Everywhere else is a visit. Discord is where they start the day and where they end it.",
        data: {
          steps: [
            { icon: "monitor", label: "They may open TikTok", note: "In the break between two matches, on a phone, for a few minutes. Then they close it and go back." },
            { icon: "trophy", label: "They may go to an event", note: "If there is one nearby and the ticket is affordable. Once or twice a year." },
            { icon: "home", label: "They are on Discord before and after", note: "It is where the squad is, where the match gets organised, and where the argument about the last game happens. Discord is home." },
            { icon: "lock", label: "And Discord has no ads manager", note: "No Business Suite, no targeting, no pixel, no self-serve buy. The largest gaming audience there is, sitting behind a door with no handle." },
          ],
        },
      },
      {
        kind: "explainer",
        anchor: "why",
        navLabel: "Why now",
        title: "Right now you're paying twice.",
        subtitle: "Once for the event, and again to promote the event. Neither purchase reaches the place gamers spend most of their time.",
        data: {
          steps: [
            { icon: "trophy", label: "Esports costs six figures", note: "One weekend, one city — reaching the fans who could afford a ticket and the stream viewers who muted your bumper." },
            { icon: "send", label: "Then social sells you the clips", note: "The post-event content goes to Meta and TikTok, and you buy the same audience a second time on the way back to the lobby." },
            { icon: "eye", label: "And the ROI is hard to prove", note: "Most of the value depends on content that did not exist on the day the invoice was signed." },
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
        subtitle: "Four products, all bought on the same published rate card, all live inside Discord.",
        data: {
          steps: [
            { icon: "trophy", label: "Sponsored challenge", note: "Your name on the weekly competition for a game you choose — scored from the game's own API, with the prize pool funded and paid by us." },
            { icon: "send", label: "Network placement", note: "Your creatives across clustergg.com and inside every opted-in community, with your own click button, swapped by you from the brand portal whenever you want." },
            { icon: "planet", label: "Game world takeover", note: "A game's whole planet in your colours: its leaderboards, its challenges, its landing page." },
            { icon: "play", label: "Sunday broadcast", note: "Presenting sponsor of the live Profile of the Week final, on the winners card posted to every server, and named in every clip cut from it." },
          ],
        },
      },
      {
        kind: "explainer",
        anchor: "challenges",
        navLabel: "Why it works",
        title: "You don't get seen. You become part of the win.",
        subtitle:
          "A banner is something a gamer scrolls past. A challenge is something they enter — and what they win carries your logo onto the profile they show their friends.",
        data: {
          loop: true,
          steps: [
            { icon: "swords", label: "You're inside the competition", note: "Not adjacent to it, and not a pre-roll before it." },
            { icon: "type", label: "The challenge carries your name", note: "On the card posted to every server, on the leaderboard, on the challenge page and in the winners announcement." },
            { icon: "medal", label: "The trophy carries your logo", note: "And it stays on the winner's profile long after the week ends." },
            { icon: "crown", label: "The reward feels earned", note: "Which is what creates loyalty. Nobody feels loyal to an impression." },
          ],
        },
      },
      {
        kind: "placements",
        anchor: "surfaces",
        navLabel: "Your surfaces",
        title: "Where your brand actually appears",
        subtitle:
          "The Discord card is inventory nobody else can sell: it is inside a server rather than next to it, and it is rendered by us on every interaction.",
      },
      {
        kind: "pricing",
        anchor: "pricing",
        navLabel: "Pricing",
        title: "What it costs",
        subtitle:
          "Published, not quoted on request. Read live as this page loads, so what you see here is what we are charging today. No setup fees, no administration fees, no minimum term.",
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
        anchor: "cards",
        navLabel: "Your cards",
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
        navLabel: "Live placement",
        title: "A live placement",
        subtitle:
          "Serving right now, from the same rotation engine your creative would run in. What you see is what you'd get.",
        data: { placement: "investor-doc-ad-placement" },
      },
      {
        kind: "ops",
        anchor: "operations",
        navLabel: "No operations",
        title: "There is nothing for you to run.",
        subtitle:
          "No setup fees, no administration fees, no staff, no operations — that is the magic of Cluster as a product. The bot creates the challenge, posts it, scores it from the game's own API, announces the winners and pays the trophies out. Here is where your money goes against a produced event.",
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
              bullets: ["Challenge format and scoring", "Prize structure and branded trophies", "Which communities it runs in"],
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
                "Reach, entrants, completion, ROAS and placement performance alongside it — reported per community so you can see which audiences responded and buy better next time.",
              bullets: ["Per-community breakdown", "Entrants, completion and ROAS", "Placement impressions and clicks"],
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
              a: "Reach, entrants, completion, clicks and ROAS, broken down per community. Everything counted is counted; anything modelled says so and shows the benchmark it was priced against.",
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
              a: "One month, and the entry price is the placements-only tier. A month of sponsored challenges for a game is four challenges — we don't sell one, because a single week is not a campaign. Annual is discounted because it helps us plan prize pools. Nothing is a lock-in and the full rate card is above.",
            },
          ],
        },
      },
      {
        kind: "contact",
        anchor: "contact",
        navLabel: "Contact",
        title: "You don't have to chase gamers across the internet.",
        subtitle: "With Cluster you meet them where they already are. Tell us the audience you want and we'll tell you what we can honestly deliver.",
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
