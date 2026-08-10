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
      "Discord is the last large gaming audience nobody can buy. Sixteen slides on how we made it buyable — every number read live from production.",
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
        subtitle: "Everywhere else is a visit. Discord is where they start and where they come back to.",
        data: {
          steps: [
            { icon: "monitor", label: "They might open TikTok", note: "For a few minutes between two matches. Then they close it." },
            { icon: "image", label: "They might open Instagram", note: "A place they pass through, not a place they are." },
            { icon: "trophy", label: "They might go to an event", note: "If one is nearby and the ticket is affordable. Once or twice a year." },
            { icon: "home", label: "Before and after all of it, they're on Discord", note: "It's where the squad is, where the match gets organised, and where the argument about the last game happens. Discord is home." },
          ],
        },
      },

      // ---------- 3. THE PROBLEM ----------
      {
        kind: "explainer",
        anchor: "problem",
        navLabel: "3 · The problem",
        title: "Reaching gamers means paying twice and reaching neither.",
        subtitle: "Once for the event. Again to promote the event. Neither lands where gamers actually spend their time.",
        data: {
          steps: [
            { icon: "trophy", label: "Pay once for the event", note: "A tournament sponsorship is six figures and lasts two days." },
            { icon: "eye", label: "The ROI won't hold still", note: "Most of the value rides on post-event content that doesn't exist yet on the day the invoice is signed." },
            { icon: "send", label: "Then pay again for the clips", note: "They go to Meta and TikTok, so you buy the same audience a second time to promote what you already paid for." },
            { icon: "lock", label: "And still nothing on Discord", note: "No ads manager, no targeting, no pixel. The biggest gaming audience there is, behind a door with no handle." },
          ],
        },
      },

      // ---------- 4. THE SOLUTION ----------
      {
        kind: "explainer",
        anchor: "solution",
        navLabel: "4 · The solution",
        title: "So we built the ads manager Discord never had.",
        subtitle: "Four things to buy, one published rate card, and numbers a media buyer already knows how to read.",
        data: {
          steps: [
            { icon: "trophy", label: "Sponsored challenges", note: "The weekly competition for a game, carrying a brand's name, inside the servers where that game is already played." },
            { icon: "monitor", label: "In-bot placements", note: "A creative on every card the bot draws, with the brand's own click button under it." },
            { icon: "medal", label: "Branded trophies", note: "Your logo on the trophy the winner keeps — and can redeem for real money." },
            { icon: "chart", label: "Numbers you can check", note: "Impressions, clicks, entrants, standings, ROAS. Counted where they can be counted, labelled as projections where they can't." },
            { icon: "users", label: "Per-community results", note: "Which server delivered what, so the next buy beats the last one. That's what makes it media and not a favour." },
          ],
        },
      },

      // ---------- 5. WHAT CLUSTER IS ----------
      {
        kind: "explainer",
        anchor: "platform",
        navLabel: "5 · Three sides",
        title: "Three sides. Take one away and the other two stop.",
        subtitle: "Which is why the loop runs on its own once it's turning.",
        data: {
          steps: [
            { icon: "target", label: "Brands", note: "Buy Discord on a published rate card, live in a month, with nothing to staff." },
            { icon: "crown", label: "Server owners", note: "Get paid for the audience they already built. They bring the community; we bring the money." },
            { icon: "gamepad", label: "Gamers", note: "Enter branded competitions, win real prizes, and never leave Discord to do it." },
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
        title: "Brands get a channel, not a favour.",
        subtitle:
          "Your name on the competition, your logo on the trophy, your creative on every card the bot draws — and a number under each of them. These are the surfaces.",
      },

      // ---------- 7. VALUE FOR SERVER OWNERS ----------
      {
        kind: "tiers",
        anchor: "owners",
        navLabel: "7 · For owners",
        title: "Server owners finally get paid for the community they built.",
        subtitle:
          "A weekly pool, competed for against the servers their own size and scored on entrants, newly linked members and conversion. No sales team, no admin, no prize money of their own. A tier is a bracket, not a rate. This is the live ladder.",
      },

      // ---------- 8. VALUE FOR GAMERS ----------
      {
        kind: "showcase",
        anchor: "gamers",
        navLabel: "8 · For gamers",
        title: "Gamers get status and prize money, not ads.",
        subtitle:
          "Build a profile, collect votes, win trophies — and either keep the trophy or redeem it for real money. Entering costs nothing: one account can be in a hundred challenges at once, and one win moves every board it's on. They were going to play anyway.",
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
        title: "You don't get seen. You become part of the win.",
        subtitle:
          "A banner is something a gamer scrolls past. A challenge is something they enter.",
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
          "A tournament is two days, six figures, and hard to prove. A challenge runs every week for {{challengePrice}} and is scored by the game's own API. Here is where each dollar goes.",
      },

      // ---------- 11. PRODUCT MAGIC ----------
      {
        kind: "product",
        anchor: "magic",
        navLabel: "11 · The product",
        title: "The whole thing lives inside Discord.",
        subtitle:
          "Challenges, live standings, trophies, brand analytics, owner payouts — and nobody running any of it. Press a button: this is the real bot, behaving exactly as it does in a server right now.",
        data: { focus: "bot" },
      },

      // ---------- 12. WHY THIS MATTERS ----------
      {
        kind: "explainer",
        anchor: "matters",
        navLabel: "12 · Why it matters",
        title: "Discord becomes four things it has never been.",
        subtitle:
          "It has the attention. What it has never had is a way to buy it.",
        data: {
          steps: [
            { icon: "send", label: "A media channel", note: "Inventory that can be described, priced, bought and reported on. Those four are what separate media from a relationship." },
            { icon: "trophy", label: "A sponsorship channel", note: "Naming rights on a recurring competition, sold per game per month — not negotiated server by server." },
            { icon: "diamond", label: "A monetization channel", note: "A revenue line for the community that built the audience, paid automatically out of the platform fee." },
            { icon: "medal", label: "A rewards channel", note: "Prize money and branded trophies that reach the player. That's why the audience turns up at all." },
          ],
        },
      },

      // ---------- 13. BUSINESS MODEL ----------
      {
        kind: "explainer",
        anchor: "model",
        navLabel: "13 · Business model",
        title: "We take a cut of the money moving through.",
        subtitle:
          "Sponsored challenges and placements, sold on a published rate card. Four steps, and we only touch one of them.",
        data: {
          steps: [
            { icon: "target", label: "Brands spend", note: "On a published rate card. A month of sponsored challenges for a game, plus placements across the network." },
            { icon: "gamepad", label: "Gamers engage", note: "They enter, they play the week under the brand's name, and they appear on its leaderboard. Engagement, not exposure." },
            { icon: "crown", label: "Server owners earn", note: "A weekly pool, shared between the servers that carried a challenge and scored on entrants, newly linked members and conversion. Never a per-challenge rate — a rate quoted is a rate we are held to." },
            { icon: "diamond", label: "Cluster takes platform revenue", note: "{{ourSharePct}} of a sale — one of four vault shares, set by an operator rather than fixed in code. The other three are owed out. There is no operations line under ours, which is where the margin comes from." },
          ],
        },
      },

      // ---------- 14. MOAT ----------
      {
        kind: "compare",
        anchor: "moat",
        navLabel: "14 · Moat",
        title: "What makes us hard to replace.",
        subtitle:
          "Anyone can sponsor content. Very few can make brand spend, gamer action and server monetization run in one loop. Here we are against the alternatives — including the rows where they beat us.",
      },

      // ---------- 15. VISION ----------
      {
        kind: "explainer",
        anchor: "vision",
        navLabel: "15 · Vision",
        title: "Where gaming marketing goes next.",
        subtitle:
          "Not only esports weekends, creator posts and short social campaigns. Five things — and we already do all five.",
        data: {
          steps: [
            { icon: "clock", label: "Attention every week, not one weekend", note: "In the place they already are, whether or not there's an event on." },
            { icon: "trophy", label: "Brands paying gamers to play", note: "Instead of paying platforms to interrupt them." },
            { icon: "chart", label: "Discord you can measure", note: "The last large audience with no ads manager, given one." },
            { icon: "users", label: "Communities that own their upside", note: "The people who built the audience take a share of what it earns, automatically." },
            { icon: "medal", label: "Rewards for what was actually played", note: "Verified against each game's own API. Nothing is self-reported." },
          ],
        },
      },

      // ---------- 16. THE ASK ----------
      {
        kind: "raise",
        anchor: "raise",
        navLabel: "16 · The ask",
        title: "We are raising $150,000 for 12%.",
        subtitle:
          "$1.25M post-money, nine months, and a plan for every dollar. The product is built — this round buys CAPACITY. A game runs one sponsored challenge at a time, so the six games we commercialise today can serve six sponsors and no more. Twenty-four adapters are already written; taking twelve more of them live takes capacity to eighteen, and eighteen is where the business covers its own costs.",
        data: {
          ask: {
            amount: 150000,
            instrument: "Priced equity round",
            valuation: 1100000,
            postMoney: 1250000,
            equityPct: 12,
            runwayMonths: 9,
            currency: "USD",
          },
          useOfFunds: [
            { label: "Game coverage — twelve more games taken live", pct: 36, note: "A game runs one sponsored challenge at a time, so a game IS a sponsor's slot. Six games serve six brands; eighteen serve eighteen. The adapters exist — twenty-four are in production code — so this line buys API access, publisher approvals and the 2,000 server onboardings that ride on the same work" },
            { label: "Team", pct: 31, note: "Four people at early-stage rates for nine months. The line that has to rise first, and what the next round is for" },
            { label: "Brand acquisition — the first month free", pct: 18, note: "36 brands x {{challengesPerGame}} sponsored challenges x {{challengePrice}}. Sized to FILL eighteen slots at a 50% conversion rate — onboarding past what the network can serve is cash spent on brands we would have to turn away" },
            { label: "Infrastructure, game APIs & partnerships", pct: 14, note: "Hosting, card rendering, the official game-API access every verified stat depends on, and the partnership work that opens each new game" },
          ],
          capTable: [
            { holder: "Founders", pct: 78, note: "Fully vesting, 4 years" },
            { holder: "This round", pct: 12, note: "$150,000 at $1,250,000 post-money" },
            { holder: "Option pool", pct: 10, note: "Reserved for the first engineering and sales hires" },
          ],
        },
      },

      // ---------- 17. THE MODEL ----------
      //
      // Anchor `finance`, not `model`: slide 13 is the BUSINESS model and
      // already owns `#model`. Two sections sharing an anchor render two
      // elements with the same id, so the side-nav link only ever reaches the
      // first and per-section reading time silently adds the two together.
      {
        kind: "finance",
        anchor: "finance",
        navLabel: "17 · The model",
        title: "The plan for the money, as a model you can argue with.",
        subtitle:
          "Every figure is computed from the assumptions on the left, and the assumptions are sliders. If you don't believe a number, move it and watch what happens — including the games slider, which is the one that moves everything else.",
        data: {},
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
          "Every number here is the live rate card. Cost of goods is the prize pool plus the weekly server pool and the points vault — three obligations, all owed to somebody else. What is left is ours, and there is no operations line under it because software reads each game's own API.",
        // B110. These were three typed rows — { revenue: 250, cost: 175 } —
        // under a subtitle claiming "every number here is the live rate card".
        // The costs had been kept in step with the prize and the revenues had
        // not, so every margin on the slide was understated by the gap between
        // the price we charge and the price somebody typed in another quarter.
        data: { liveUnits: true },
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
              value: "{{networkMonth}} / mo",
              note: "{{games}} games at {{perGameMonth}} a month. A game runs one sponsored challenge at a time, so that is also {{games}} sponsors — the ceiling, not a target. The rate card is published, so this is checkable.",
              source: "clustergg.com/pricing · the live rate card this page reads from",
            },
            {
              label: "The catalogue already built",
              value: "24 adapters",
              note: "Twenty-four providers across twenty-three games, written and in production code. Commercialising all of them is twenty-three sponsor slots at today's rate card with no new engineering — what stands in the way is publisher API access, not build time. That gap is what this round closes.",
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
                "The product had to be worth installing before any distribution argument mattered: zero setup, every reply a rendered card rather than a wall of text, and account linking inside Discord. Those are the three places comparable tools lose people.",
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
                "We go after servers that already run tournaments and argue about rank — they need this rather than needing convincing. Each install gives the owner a portal showing their progress toward sponsored challenges, which becomes the pitch to the next server, made by someone who isn't us.",
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
                "Once enough servers cross the threshold, the aggregate is something a brand can buy against: verified players of a named game, in communities of a known size. The rate card is public so a buyer qualifies us in one visit instead of three meetings, and the first sponsored challenges become the case studies for the next ten.",
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
              a: "Because it isn't one product, it's three that only work together: the game integrations that make an audience describable, the loyalty loop that makes it worth advertising to, and the revenue share that makes server owners want you there. Any one alone fails — a stats bot nobody monetises, an ad network with nothing verified behind it, a rev-share deal with no product to attach it to. The work is in the combination, and it took months.",
            },
            {
              q: "What stops Discord from building this?",
              a: "Discord builds infrastructure, not game-specific integrations — this is 24 separate API relationships and the normalisation between them, which is neither strategic for them nor cheap. And our value is the cross-game identity plus the revenue relationship with owners. Discord has no interest in paying servers.",
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
              a: "Because \"contact us for pricing\" loses the brand who was ready to buy and only wanted to know whether we were a $600 or a $60,000 decision. Published pricing qualifies buyers before they take our time, and it makes the model legible to the owners we're asking to trust it. The numbers live in the CMS, so sales can still negotiate.",
            },
            {
              q: "What are you raising, and for what?",
              a: "$150,000 for 12%, at $1.25M post-money. The terms are on slide sixteen with the use of funds and the cap table beside them. In short: twelve more games taken live, because a game runs one sponsored challenge at a time and each one is a sponsor's slot; the communities and brands to fill them; and nine months of team.",
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

  // ===================== FINANCIAL MODEL =====================
  // The model, on its own, because "can we see the numbers" is the question
  // that follows every good first meeting — and answering it with a spreadsheet
  // attachment is how a conversation goes cold. This is the same arithmetic the
  // deck quotes, with the assumptions exposed as controls, so a reader who
  // doubts a figure can change it and watch the consequence instead of writing
  // an email about it.
  {
    slug: "financial-model",
    kind: "deck",
    title: "Cluster — the financial model",
    subtitle: "Where $150,000 goes, what it buys, and what has to be true",
    summary:
      "Use of funds split into cash and foregone revenue, month-by-month cash flow, the breakeven point, four downside scenarios and the valuation the round implies. Every number is computed from the assumptions shown, and the assumptions are editable — including the ones that make us look worse.",
    accent: "#34d399",
    accent2: "#8b5cf6",
    contactEmail: "founders@clustergg.com",
    contactNote: "If a number here looks wrong, change it on the page and tell us what you got.",
    sections: [
      {
        kind: "hero",
        anchor: "top",
        navLabel: "Overview",
        title: "Every dollar of the raise, accounted for.",
        subtitle:
          "$150,000 buys nine months, twelve more games taken live out of the twenty-four already built, two thousand Discord communities and thirty-six brands through a free first month. The constraint is inventory, not demand: a game serves one sponsor at a time, so capacity goes from six to eighteen and the business covers its costs in month seven. Here is the arithmetic, with nothing rounded in our favour.",
        data: {},
      },
      {
        kind: "unit",
        anchor: "unit",
        navLabel: "1 · The unit",
        title: "It all rests on one number.",
        subtitle:
          "A brand pays {{challengePrice}} for a sponsored challenge. {{prizePool}} of it is the prize pool and reaches a gamer; the weekly server pool and the points vault take their shares next, and both are owed to somebody else. {{ourShare}} — {{ourSharePct}} — is ours, and that is the only line the business lives on. Every total in this document is built from it.",
        data: {},
      },
      {
        kind: "finance",
        anchor: "model",
        navLabel: "2 · The model",
        title: "The plan for the money, as a model you can argue with.",
        subtitle:
          "Assumptions on the left, consequences on the right. Cash and foregone revenue are shown separately because only one of them is runway. Free-to-paid conversion has its own scenario table because it is the assumption with no evidence behind it yet.",
        data: {},
      },
      {
        kind: "text",
        anchor: "honesty",
        navLabel: "3 · What we'd challenge",
        title: "The three numbers we would push back on ourselves.",
        subtitle:
          "A model that only flatters the people who built it is not worth reading. These are the assumptions we think an investor should press hardest, and what happens to the plan under each.",
        data: {
          bullets: [
            "Game coverage, and it has replaced conversion as the thing to press hardest. A game runs one sponsored challenge at a time, so a game IS a sponsor's slot — the six we commercialise today cap revenue at roughly $100,000 of ARR against a $7,000 monthly cost base, and no conversion rate fixes that. The adapters are already written: twenty-four providers across twenty-three games are in production code. What stands between them and being sellable is API ACCESS — publisher keys and approvals, most of which are an application and a wait rather than an engineering task. Nothing in this business has proven that pace yet, and the honest version is that the timing is not entirely ours: an approval we are waiting on is a slot that does not exist until it lands.",
            "Free-to-paid conversion, now the second question rather than the first. The plan shows 18 of 36 staying — 50%, the middle of the 20-40% normal for a B2B free trial with room above it. It matters less than it used to precisely because capacity binds first: at eighteen slots, a conversion rate above 50% sells nothing extra.",
            "Server acquisition at $25. Two thousand communities in nine months is about seven a day, every day, sustained. The $25 welcome challenge is what makes the offer concrete rather than a cold DM, but the rate is an assumption about outbound effort, not about money.",
          ],
        },
      },
      {
        kind: "raise",
        anchor: "raise",
        navLabel: "4 · The round",
        title: "$150,000 for 12%, at $1.25M post-money.",
        subtitle:
          "Nine months of runway against a product that is already built and already running. The use-of-funds split below is the one the model computes — 36% game coverage and server onboarding, 31% team, 18% brand acquisition, 14% infrastructure. Every figure is derived, not typed.",
        data: {
          ask: {
            amount: 150000,
            instrument: "Priced equity round",
            valuation: 1100000,
            postMoney: 1250000,
            equityPct: 12,
            runwayMonths: 9,
            currency: "USD",
          },
          useOfFunds: [
            { label: "Game coverage — twelve more games taken live", pct: 36, note: "A game runs one sponsored challenge at a time, so a game IS a sponsor's slot. Six games serve six brands; eighteen serve eighteen. The adapters exist — twenty-four are in production code — so this line buys API access, publisher approvals and the 2,000 server onboardings that ride on the same work" },
            { label: "Team", pct: 31, note: "Four people at early-stage rates for nine months. The line that has to rise first, and what the next round is for" },
            { label: "Brand acquisition — the first month free", pct: 18, note: "36 brands x {{challengesPerGame}} sponsored challenges x {{challengePrice}}. Sized to FILL eighteen slots at a 50% conversion rate — onboarding past what the network can serve is cash spent on brands we would have to turn away" },
            { label: "Infrastructure, game APIs & partnerships", pct: 14, note: "Hosting, card rendering, the official game-API access every verified stat depends on, and the partnership work that opens each new game" },
          ],
          capTable: [
            { holder: "Founders", pct: 78, note: "Fully vesting, 4 years" },
            { holder: "This round", pct: 12, note: "$150,000 at $1,250,000 post-money" },
            { holder: "Option pool", pct: 10, note: "Reserved for the first engineering and sales hires" },
          ],
        },
      },
      {
        kind: "contact",
        anchor: "contact",
        navLabel: "Contact",
        title: "Change a number and tell us what you got.",
        subtitle: "We would rather defend the model than the slide.",
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
      "Why gamers live on Discord, why reaching them today means paying twice, what a sponsored challenge actually is, and what it costs. Every number read live from production.",
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
          "Your name on the weekly competition, your creative on every card the bot draws, your logo on the trophy. Inside the place gamers actually live. You're not buying impressions — you're paying gamers to play under your name.",
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
          "The bot creates the challenge, posts it, scores it from the game's own API, announces the winners and pays the trophies out. No setup fee, no staff, no operations. Here's where your money goes against a produced event.",
      },
      // The offer. Placed before "how it works" because a buyer decides whether
      // to keep reading on what it costs them, not on the process.
      {
        kind: "text",
        anchor: "offer",
        navLabel: "The founding offer",
        title: "The first hundred brands get the first month on us.",
        subtitle:
          "We're funding the start of this network out of the round, not out of your budget. It isn't a discount dressed up as a favour — it's how a marketplace with real inventory and no case studies yet buys its first ones.",
        data: {
          bullets: [
            "The placements base drops from $600 to $500 a month for the first hundred brands, and stays there for as long as you keep the plan.",
            "Taking it unlocks $1,000 of challenge credit for your first month on one game — four sponsored weekly challenges carrying your name, with the prize pools funded by us.",
            "Nothing changes about what you get: verified entrants read from the game's own API, per-community reporting, your logo on the trophy, and the brand portal to run it yourself.",
            "One month minimum after that. If the first month does not produce numbers you can take to your CMO, there is nothing to cancel out of.",
            "Already a customer? The same offer applies to you — a month of challenge credit on any plan you already hold. We are not going to make existing brands pay to watch new ones get a better deal.",
          ],
        },
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
