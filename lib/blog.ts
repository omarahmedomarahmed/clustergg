// The blog.
//
// Written as content, kept in the repo rather than the database, for one
// reason: these posts are the SEO surface and they need to be reviewable in a
// diff. A CMS-editable blog is a blog nobody can code-review, and a
// hallucinated statistic in a post that ranks is worse than no post.
//
// Every post follows the same rule: it has to be worth reading if you never
// install anything. Cluster appears where it's genuinely the answer, and is
// named plainly rather than smuggled in — a reader who feels sold to leaves,
// and a reader who feels helped comes back.
//
// TWO THINGS ARE DELIBERATELY NOT LITERALS HERE.
//
// Numbers are written as {tokens} and filled at render from live production
// data (`blogVars`). A post that says "$250" ages the day pricing changes; a
// post that says "{price}" cannot. Charts don't carry values at all — a chart
// names a SOURCE and the page derives the bars from the live rate card, the
// live ladder or the live network. That rule exists because a bar chart is the
// easiest place in a document to state a number nobody checked.

import { EARN_TIERS, platformFeePct, ownerPctFor } from "@/lib/server-earnings";
import { money, PRICING_DEFAULTS, type PricingConfig } from "@/lib/pricing";
import type { NetworkStats } from "@/lib/network";

/** Where a chart's numbers come from. There is no fourth option on purpose. */
export type ChartSource = "split" | "ladder" | "reach";

export type BlogSection =
  | { kind: "p"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "cta"; text: string; href: string; label: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  /** An image. `src` may point at /api/card/*, which draws it live. */
  | { kind: "figure"; src: string; alt: string; caption?: string }
  | { kind: "chart"; from: ChartSource; title: string; note?: string }
  /** An ad placement, inline in the article. Renders nothing when unsold. */
  | { kind: "ad" };

export const CATEGORIES = [
  "Monetize your server",
  "Advertise to gamers",
  "Run a better server",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type BlogPost = {
  slug: string;
  title: string;
  category: Category;
  /** The meta description. Written to be the answer to the search, not a tease. */
  description: string;
  /** The question this post exists to answer, verbatim as someone would ask it.
   *  Used for the FAQ structured data an assistant is most likely to quote. */
  question: string;
  answer: string;
  published: string;   // ISO date
  updated?: string;
  readMinutes: number;
  tags: string[];
  /** Card art for the index and the link preview. A /api/card/* URL draws live. */
  cover: string;
  body: BlogSection[];
  /** Internal links. Every post links to at least two others and to the
   *  product page — orphan pages don't rank and don't get read. */
  related: string[];
};

// ===== Live values =====
//
// Every {token} a post may contain. Missing keys are left alone rather than
// blanked, so a typo shows up as `{typo}` in review instead of a hole in a
// sentence nobody notices.

export type BlogVars = Record<string, string>;

export function blogVars(net: NetworkStats | null, cfg: PricingConfig | null): BlogVars {
  const c = cfg;
  const price = c?.challengePrice ?? PRICING_DEFAULTS.challengePrice;
  const prize = c?.prizePool ?? PRICING_DEFAULTS.prizePool;
  const n = (v: number | undefined) => (v ?? 0).toLocaleString();
  return {
    price: money(price, c?.currency),
    prize: money(prize, c?.currency),
    fee: money(Math.max(0, price - prize), c?.currency),
    month: money(price * (c?.challengesPerGame ?? 4), c?.currency),
    servers: n(net?.servers),
    reach: n(net?.reach),
    gamers: n(net?.gamers),
    linked: n(net?.linked),
    games: n(net?.games),
    live: n(net?.challenges),
    unlock: (EARN_TIERS[1]?.threshold ?? 500).toLocaleString(),
    ownerPct: `${ownerPctFor(EARN_TIERS[1]?.threshold ?? 500)}%`,
  };
}

export function fillTokens(text: string, vars: BlogVars): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole);
}

/** Every token a post uses, so a test can prove none of them is a typo. */
export function tokensIn(post: BlogPost): string[] {
  const out = new Set<string>();
  const scan = (s: string) => { for (const m of s.matchAll(/\{(\w+)\}/g)) out.add(m[1]); };
  scan(post.title); scan(post.description); scan(post.answer);
  for (const s of post.body) {
    if ("text" in s && s.text) scan(s.text);
    if ("items" in s) s.items.forEach(scan);
    if ("title" in s && s.title) scan(s.title);
    if ("note" in s && s.note) scan(s.note);
    if ("caption" in s && s.caption) scan(s.caption);
    if ("rows" in s) s.rows.forEach((r) => r.forEach(scan));
    if ("head" in s) s.head.forEach(scan);
  }
  return [...out];
}

// ===== Charts =====
//
// A bar is a claim. Each one here is computed from something the platform is
// actually running on, and carries the place a reader can go and check it.

export type ChartBar = {
  label: string;
  /** Bar length, relative to the largest bar in the set. */
  value: number;
  /** What's printed on the bar. Never derived from `value` by the component. */
  display: string;
  hint?: string;
  accent?: "violet" | "cyan" | "emerald" | "amber";
};

export type Chart = { bars: ChartBar[]; source: string };

export function chartData(
  from: ChartSource,
  ctx: { cfg: PricingConfig | null; net: NetworkStats | null },
): Chart {
  const cfg = ctx.cfg;
  const price = cfg?.challengePrice ?? PRICING_DEFAULTS.challengePrice;
  const prize = cfg?.prizePool ?? PRICING_DEFAULTS.prizePool;
  const cur = cfg?.currency;

  switch (from) {
    case "split": {
      // Where one sponsored challenge goes. The owner's cut comes out of the
      // platform fee, not out of the prize — so it is drawn inside the fee.
      const fee = Math.max(0, price - prize);
      const ownerPct = ownerPctFor(EARN_TIERS[1]?.threshold ?? 500);
      const owner = Math.round((price * ownerPct) / 100);
      return {
        source: "The live rate card at /pricing",
        bars: [
          { label: "To the players", value: prize, display: money(prize, cur), accent: "emerald",
            hint: `${Math.round((prize / price) * 100)}% of what a brand pays, won as prizes` },
          { label: "To the server it ran in", value: owner, display: money(owner, cur), accent: "cyan",
            hint: `${ownerPct}% at ${(EARN_TIERS[1]?.threshold ?? 500).toLocaleString()} linked gamers, taken out of our fee` },
          { label: "Cluster keeps", value: Math.max(0, fee - owner), display: money(Math.max(0, fee - owner), cur), accent: "violet",
            hint: "What's left. There is no operations line under it" },
        ],
      };
    }
    case "ladder": {
      // What each rung is worth per challenge, so the ladder is money and not
      // a percentage nobody can picture.
      return {
        source: "lib/server-earnings.ts · the same table the owner portal reads",
        bars: EARN_TIERS.map((t) => ({
          label: t.threshold === 0 ? "From day one" : `${t.threshold.toLocaleString()} linked`,
          value: Math.max(t.ownerPct, 0.6),
          display: t.ownerPct === 0 ? "—" : money(Math.round((price * t.ownerPct) / 100), cur),
          hint: t.ownerPct === 0
            ? "Private challenges and a public server page, but no share yet"
            : `${t.ownerPct}% of every sponsored challenge that runs in your server`,
          accent: t.ownerPct >= 25 ? "emerald" : t.ownerPct >= 10 ? "cyan" : "violet",
        })),
      };
    }
    case "reach": {
      const net = ctx.net;
      const bars: ChartBar[] = [
        { label: "Servers running the bot", value: net?.servers ?? 0, display: (net?.servers ?? 0).toLocaleString(), accent: "violet" },
        { label: "Members inside them", value: net?.reach ?? 0, display: (net?.reach ?? 0).toLocaleString(), accent: "cyan",
          hint: "Combined Discord membership — the people it can reach" },
        { label: "Gamers with a profile", value: net?.gamers ?? 0, display: (net?.gamers ?? 0).toLocaleString(), accent: "emerald" },
        { label: "…who linked a game account", value: net?.linked ?? 0, display: (net?.linked ?? 0).toLocaleString(), accent: "amber",
          hint: "Verified against the game's own API. This is the number a brand buys" },
      ];
      return { source: "Read from production the moment you loaded this page", bars };
    }
  }
}

// ===== Navigation =====

export function anchorId(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/** The headings a reader can jump to. h2s only — an h3 in the rail is noise. */
export function tableOfContents(post: BlogPost): { id: string; text: string }[] {
  return post.body
    .filter((s): s is { kind: "h2"; text: string } => s.kind === "h2")
    .map((s) => ({ id: anchorId(s.text), text: s.text }));
}

export const POSTS: BlogPost[] = [
  // ===================== FOR BRANDS =====================
  {
    slug: "how-to-advertise-on-discord",
    title: "How to advertise on Discord when Discord has no ads manager",
    category: "Advertise to gamers",
    description:
      "Discord sells no ads and has no self-serve buy. Here are the four ways a brand can actually reach gamers inside servers, what each one costs, and which ones a media buyer can report on.",
    question: "Can you advertise on Discord?",
    answer:
      "Not through Discord itself — there is no ads manager, no targeting and no pixel. Brands reach Discord through the servers instead: direct sponsorship deals with individual owners, creator placements, bot-delivered inventory, or a platform that sells across many servers at once. Cluster does the last one: a sponsored weekly challenge costs {price}, of which {prize} is prize money won by the players, and it runs across every server that opted in.",
    published: "2026-07-24",
    readMinutes: 8,
    tags: ["discord advertising", "media buying", "gaming marketing"],
    cover: "/api/card/challenge?preview=1",
    related: ["marketing-to-gamers", "how-discord-servers-make-money"],
    body: [
      { kind: "p", text: "Every other audience this size has a self-serve buy. You open a manager, pick an audience, upload a creative, and see a number on Friday. Discord has none of that — no Business Suite, no targeting, no pixel, no rate card." },
      { kind: "p", text: "That is not because nobody wants it. It's because Discord's product is servers, and a server is somebody else's room. So advertising on Discord means dealing with the rooms, and there are exactly four ways to do that." },

      { kind: "h2", text: "1. Deal with server owners directly" },
      { kind: "p", text: "Find a big server, message the owner, negotiate. This works, and it is how most Discord money changes hands today." },
      { kind: "p", text: "The problem is that it doesn't scale and it doesn't report. You are negotiating a bespoke deal per server, with a person who has no analytics beyond a member count, and no way to prove what you got. Ten servers is ten contracts, ten invoices and ten different definitions of \"reach\"." },

      { kind: "h2", text: "2. Buy the creators instead" },
      { kind: "p", text: "Sponsor the streamer whose community the server is built around. You get real influence and a name people trust, and you're buying attention on Twitch or YouTube that happens to spill into Discord — not attention in Discord." },
      { kind: "p", text: "Fine as a strategy. Just don't file it under \"we advertised on Discord\", because the spend lands somewhere else." },

      { kind: "h2", text: "3. Bots with ad inventory" },
      { kind: "p", text: "Some bots sell space in the messages they post. This is the closest thing Discord has to display inventory, and it's genuinely inside the room." },
      { kind: "p", text: "What to check before you buy it: whether an impression means a message was sent or a message was seen, whether you get server-level reporting or one aggregate number, and whether members experience it as an ad. A bot that spams a channel gets removed, and your campaign goes with it." },

      { kind: "h2", text: "4. Sponsor what the community was going to do anyway" },
      { kind: "p", text: "The version that doesn't get muted. Instead of inserting a message into a community, you fund something the community wanted — a competition on the game they already play, with a prize that's worth entering for." },
      { kind: "p", text: "This is what Cluster sells, so weigh the rest of this section accordingly. A sponsored challenge costs {price}. {prize} of that is the prize pool and is won by players. The rest is the platform fee, and the server it ran in takes a share of that." },

      { kind: "chart", from: "split", title: "Where {price} actually goes", note: "The split is the whole business model. There is no second price list." },

      { kind: "p", text: "Your name is on the competition card the bot posts into every participating server, on the leaderboard, on the challenge page, and in the winners announcement. Your logo is on the trophy the winner keeps on their profile." },

      { kind: "figure", src: "/api/card/challenge?preview=1", alt: "A sponsored challenge card as posted into a Discord server", caption: "A live challenge card, drawn by the same renderer that serves Discord. Nothing here is a mockup." },

      { kind: "ad" },

      { kind: "h2", text: "What a media buyer should ask for" },
      {
        kind: "ul",
        items: [
          "Verified audience, not member counts. \"12,000 members\" includes everyone who joined for a giveaway in 2024. Ask how many linked a game account — that's a person who demonstrably plays what you're advertising to.",
          "Per-community reporting. One aggregate number tells you nothing about where to spend next.",
          "A definition of every metric. Impressions, entrants and clicks each mean at least two things. Get the definition in writing before the invoice.",
          "What's modelled versus counted. Anything projected should say so and name the benchmark it was priced against.",
        ],
      },

      { kind: "h2", text: "What this costs today" },
      { kind: "p", text: "Our rate card is published rather than quoted on request, because \"contact us for pricing\" wastes the time of a buyer who only wanted to know whether we're a {price} decision or a six-figure one." },
      {
        kind: "table",
        head: ["What you buy", "Price", "What lands"],
        rows: [
          ["One sponsored challenge", "{price}", "A week of competition on one game, carrying your name, in every opted-in server"],
          ["One game, one month", "{month}", "Four challenges — a month is the smallest thing we'd call a campaign"],
          ["Network placements", "See /pricing", "Your creative on every card the bot draws, with your own click button under it"],
        ],
      },

      { kind: "h2", text: "The honest limitations" },
      {
        kind: "ul",
        items: [
          "No behavioural targeting. You target by game and by community, not by a browsing profile. There is no pixel and we are not building one.",
          "It only works for games with a public API. Everything is scored from official game data, so a game that publishes nothing can't carry a challenge.",
          "Reach is what it is. We publish the live network numbers rather than a projection — if it's too small for your campaign, we'd rather you knew in the first conversation.",
        ],
      },

      { kind: "chart", from: "reach", title: "The network, right now", note: "Live figures, not a deck. The bottom bar is the one that matters to a brand." },

      { kind: "cta", text: "Published rate card, live network numbers, and no call required to see either.", href: "/pricing", label: "See what it costs" },
    ],
  },

  {
    slug: "marketing-to-gamers",
    title: "Marketing to gamers: why the usual playbook pays twice and reaches neither",
    category: "Advertise to gamers",
    description:
      "Esports sponsorship, creator deals and social ads all reach gamers somewhere other than where gamers spend their time. What each one is actually good for, and what to do about the gap.",
    question: "How do you market to gamers?",
    answer:
      "The three standard channels each buy attention adjacent to gaming rather than inside it: esports sponsorship buys a two-day event, creator deals buy one person's audience, and social ads buy the scroll between matches. The place gamers actually spend their time is Discord, which has no ads manager — so reaching it means sponsoring what communities already do, such as a weekly competition, rather than buying impressions.",
    published: "2026-07-25",
    readMinutes: 7,
    tags: ["gaming marketing", "discord marketing", "esports"],
    cover: "/api/card/planets",
    related: ["how-to-advertise-on-discord", "how-discord-servers-make-money"],
    body: [
      { kind: "p", text: "A gamer's day has a shape. They queue, they play, they argue about the match, they queue again. Somewhere in there they open TikTok for four minutes. Twice a year they go to an event." },
      { kind: "p", text: "Now look at where marketing budgets go, and notice that it's the four minutes and the two days." },

      { kind: "h2", text: "Esports sponsorship" },
      { kind: "p", text: "You get a real audience, a real moment, and production values nobody else can offer. You also get a two-day window for a six-figure cheque, and most of the value depends on post-event content that doesn't exist yet on the day you sign." },
      { kind: "p", text: "Then the clips go to Meta and TikTok, and you buy the same audience a second time to promote the thing you already paid for. That's the part people leave out of the case study." },

      { kind: "h2", text: "Creator deals" },
      { kind: "p", text: "The highest-trust channel there is, and the least controllable. You're renting one person's credibility, which works beautifully until that person has a bad month. Portfolio it or don't do it." },

      { kind: "h2", text: "Social ads" },
      { kind: "p", text: "Cheap, measurable, and aimed at someone doing something else. A gamer on TikTok is between matches — they're not in a gaming context, they're in a scrolling context, and the difference shows up in everything downstream of the click." },

      { kind: "h2", text: "The place nobody buys" },
      { kind: "p", text: "Before the match and after it, they're in Discord. It's where the squad is, where the game gets organised, and where the argument about the last one happens. It is not a place gamers visit. It's where they are." },
      { kind: "p", text: "And it has no ads manager. No targeting, no pixel, no self-serve buy — the largest gaming audience there is, sitting behind a door with no handle. That is the actual gap in every gaming media plan, and it's why the other three channels get more money than they deserve." },

      { kind: "figure", src: "/api/card/planets", alt: "The Cluster game galaxy card, showing each game world the bot covers", caption: "One card, drawn live: every game we sync, each with its own weekly competition." },

      { kind: "ad" },

      { kind: "h2", text: "What works inside a community" },
      { kind: "p", text: "The rule is simple and it's the same rule that governs whether a server mutes you: fund something the community wanted, don't insert something it didn't." },
      {
        kind: "ul",
        items: [
          "A competition on the game they already play, with a prize worth entering for. Nobody experiences this as an ad, because they were going to play anyway.",
          "A prize that reaches a person. Branded trophies stay on a profile where that player's friends see them, long after the week ends.",
          "Recognition, not interruption. The thing people remember is what they won and who paid for it. Nobody remembers an impression.",
        ],
      },
      { kind: "p", text: "We build the platform that does this, so treat that list as interested advice. The reasoning holds whoever you buy it from." },

      { kind: "h2", text: "What to measure instead of impressions" },
      {
        kind: "table",
        head: ["Instead of", "Ask for", "Because"],
        rows: [
          ["Impressions", "Entrants", "Someone who entered a competition did something. Someone who saw a message may not have been looking"],
          ["Reach", "Verified players", "A member count includes everyone who joined for a giveaway two years ago"],
          ["Engagement rate", "Cost per entrant", "It's the one number that compares cleanly against every other channel you buy"],
          ["Brand lift study", "Who kept the trophy", "It carries your logo, it's on a public profile, and it's still there next month"],
        ],
      },

      { kind: "h2", text: "The arithmetic, on our rate card" },
      { kind: "p", text: "A sponsored challenge is {price}. {prize} of that is prize money, won by players. Divide {price} by the entrants and you have a cost per entrant that a media buyer can put next to anything else on the plan — no benchmark required, because an entrant is a person who did a thing." },

      { kind: "chart", from: "split", title: "One challenge, {price}", note: "Most of what a brand pays is prize money. That's the point — it's why entering feels like a competition and not an ad." },

      { kind: "cta", text: "Live network numbers and the full rate card, without a call.", href: "/pricing", label: "See the rate card" },
    ],
  },

  // ===================== FOR SERVER OWNERS =====================
  {
    slug: "how-discord-servers-make-money",
    title: "How Discord servers actually make money in 2026",
    category: "Monetize your server",
    description:
      "Every real revenue model for a Discord community — server subscriptions, sponsorships, affiliate deals, paid roles and ad revenue share — with what each one requires and roughly what it pays.",
    question: "How can I make money from my Discord server?",
    answer:
      "Five models work: Discord's own Server Subscriptions, direct brand sponsorships, affiliate links, paid roles for perks, and revenue share from a platform that monetises your audience for you. Sponsorships pay the most but need a media kit and numbers you can prove. Revenue share pays less and requires nothing beyond keeping the community active — on Cluster it starts at {unlock} linked gamers and pays {ownerPct} of every sponsored challenge that runs in your server.",
    published: "2026-07-21",
    readMinutes: 9,
    tags: ["discord", "monetization", "community"],
    cover: "/api/card/guide?topic=challenges",
    related: ["how-to-advertise-on-discord", "discord-engagement-ideas-that-actually-work"],
    body: [
      { kind: "p", text: "Running a big Discord is a real job that mostly pays nothing. Here's an honest survey of the ways that actually work, including ours, and what each one costs you." },

      { kind: "h2", text: "1. Server Subscriptions" },
      { kind: "p", text: "Discord lets eligible servers sell monthly memberships and takes a cut. Lowest friction of anything here — the payment rails exist and nobody leaves the app." },
      { kind: "p", text: "The catch is what you're selling. A subscription needs a perk people would miss, which usually means a private channel, early access, or something you personally provide — and that something becomes a recurring obligation. Plenty of servers launch one and quietly abandon it three months later, because the perk turned into homework." },

      { kind: "h2", text: "2. Brand sponsorships" },
      { kind: "p", text: "The highest-paying option by a wide margin, and the hardest to land. A brand is buying reach and relevance, so you need numbers you can prove and an audience that matches what they sell." },
      {
        kind: "ul",
        items: [
          "Real, checkable metrics — members, weekly actives, message volume, and ideally what your members actually play.",
          "A media kit. One page: who your community is, how many, how engaged, and what a sponsorship gets them.",
          "Something measurable to deliver. \"We'll mention you\" is worth far less than \"we ran a competition with your prize and here are the entrants.\"",
        ],
      },
      { kind: "p", text: "Most servers stall on the first point. Discord's own analytics are thin, and \"we have 12,000 members\" means nothing when a third of them joined for one giveaway in 2024." },

      { kind: "h2", text: "3. Affiliate links" },
      { kind: "p", text: "Easy to start, easy to overdo. Works when the product is something your community was going to buy anyway — peripherals, game keys, a service they already use. It stops working the moment members feel farmed, and that damage doesn't undo." },

      { kind: "h2", text: "4. Paid roles" },
      { kind: "p", text: "A one-off or recurring payment for a coloured role, a flair, or access to something cosmetic. It works better than it sounds, because it's a status purchase rather than a utility one — people are buying visibility among people they know." },
      { kind: "p", text: "Keep it cosmetic. The moment a paid role grants an advantage in something competitive, you've built a pay-to-win game and the people who lose are the ones who made it worth joining." },

      { kind: "ad" },

      { kind: "h2", text: "5. Revenue share from a platform" },
      { kind: "p", text: "Some platforms monetise the audience for you and pass back a share. That's what Cluster does, and it's fair to say that's why we're writing this — so here are the terms rather than a pitch." },
      { kind: "p", text: "A brand pays {price} for a sponsored weekly challenge. {prize} of it is the prize pool and is won by your members. The rest is the platform fee, and your cut comes out of that — not out of the prize." },

      { kind: "chart", from: "ladder", title: "What a server earns per sponsored challenge", note: "\"Linked\" means members who joined Cluster and connected a game account — not raw member count." },

      {
        kind: "table",
        head: ["Linked members", "What unlocks"],
        rows: [
          ["From day one", "Private challenges for your community, and a public server page with your logo and invite"],
          ["{unlock}", "Brand-sponsored challenges run in your server, with the prize money won by your members"],
          ["1,000", "You can carry other servers' challenges, and are paid to"],
          ["5,000", "Brands sponsor challenges directly in your server and you keep the whole fee"],
        ],
      },
      { kind: "p", text: "The threshold counts linked accounts rather than joins on purpose. An advertiser is paying for people who demonstrably play the games being advertised to, and a headline member count doesn't establish that. It also means the number is slower to reach and worth more when you get there." },
      { kind: "p", text: "The tradeoff is that it pays less than a direct sponsorship for the same audience. What you buy with the difference is not having to sell anything." },

      { kind: "figure", src: "/api/card/guide?topic=challenges", alt: "The pinned how-to card explaining challenges, as posted in a server", caption: "What lands in your server on install: a pinned card per topic, so nobody has to be told a command exists." },

      { kind: "h2", text: "What we'd actually recommend" },
      { kind: "p", text: "Under a few thousand members, chase engagement rather than revenue. Every model above pays in proportion to how alive the community is, and none of them fixes a quiet server." },
      { kind: "p", text: "Above that, run two in parallel: something passive that pays without ongoing work, and one direct sponsorship attempt per quarter. The passive one funds the effort of the other." },

      { kind: "cta", text: "Sponsored challenges unlock at {unlock} linked gamers, and the counter is visible from day one.", href: "/discord-bot", label: "See how the tiers work" },
    ],
  },

  // ===================== RUNNING A SERVER =====================
  {
    slug: "how-to-track-game-stats-in-discord",
    title: "How to track game stats inside Discord (without anyone leaving the server)",
    category: "Run a better server",
    description:
      "A practical guide to putting live League, Valorant, Apex, CS2 and Fortnite stats into a Discord server — what the options are, what each one costs you, and how to set it up in about a minute.",
    question: "How do I show game stats in a Discord server?",
    answer:
      "Add a bot that reads the games' official APIs and renders stats as images in the channel. ClusterBot does this for {games} games: members link a game account once from inside Discord, and their rank, wins and recent matches render as a card with buttons to navigate. It's free, installs in one click, and needs no configuration.",
    published: "2026-07-20",
    readMinutes: 7,
    tags: ["discord", "guide", "game stats"],
    cover: "/api/card/profile?preview=1",
    related: ["discord-engagement-ideas-that-actually-work", "how-discord-servers-make-money"],
    body: [
      { kind: "p", text: "Every gaming Discord hits the same wall eventually. Someone posts a screenshot of their rank. Someone disputes it. A third person asks who's actually the best in the server, and nobody can answer, because the only record is a scroll-back full of cropped screenshots." },
      { kind: "p", text: "The fix is real, verifiable stats in the channel. Here's how the options compare." },

      { kind: "h2", text: "Option 1: screenshots and an honour system" },
      { kind: "p", text: "Free, instant, and worthless the moment anything is at stake. A screenshot proves nothing — it can be old, cropped, or someone else's. If there's a prize involved, this is the option that ends in an argument." },

      { kind: "h2", text: "Option 2: a spreadsheet someone maintains" },
      { kind: "p", text: "This works for about three weeks. It works because one person is doing unpaid data entry, and it stops the day that person gets bored. Every community that has tried it knows exactly which week it died." },

      { kind: "h2", text: "Option 3: a bot that reads the game's own API" },
      { kind: "p", text: "The only version that survives contact with a real community, because nobody has to do anything for it to keep working. The game's API is the source of truth, the bot reads it on a schedule, and the numbers are the same numbers the game shows." },
      { kind: "p", text: "The tradeoff is that it only works for games with a public API. That's most of the big ones — Riot covers League and Valorant, Steam covers CS2 and playtime, and Apex, Fortnite, PUBG, osu!, Chess.com and Lichess all expose ranked data — but it isn't everything." },

      { kind: "figure", src: "/api/card/profile?preview=1", alt: "A gamer profile card rendered by ClusterBot, showing rank and linked games", caption: "One profile, every game. Rendered live — this is the actual card, not a screenshot of one." },

      { kind: "h2", text: "Setting it up with ClusterBot" },
      { kind: "p", text: "Cluster is the bot we build, so read this section as what it is: instructions for our tool. The general approach above applies whatever you use." },
      {
        kind: "ol",
        items: [
          "Add the bot to your server. It asks for the permissions it uses and nothing more — it never reads message content, and it can't, because we don't request that intent.",
          "It creates a #clustergg channel and pins a how-to card for every part of the product. Nobody has to be told a command exists.",
          "A member types /cluster and taps Connect a game. A form opens inside Discord — they type their in-game name, and that's the whole setup.",
          "From then on their rank, wins, champions and recent matches render as a card in the channel, refreshed on every sync.",
        ],
      },
      { kind: "p", text: "No dashboard to configure, no webhook to wire. It's one click because a bot that needs a setup call is a bot nobody installs." },

      { kind: "ad" },

      { kind: "h2", text: "What to do once the stats are there" },
      { kind: "p", text: "Stats on their own are a novelty. What makes them stick is competing against them:" },
      {
        kind: "ul",
        items: [
          "Run a leaderboard per metric your community actually argues about — rank is obvious, but win rate, KD and hours are often the ones people care about more.",
          "Start a challenge with a real prize. Stats are snapshotted the moment someone joins, so only new activity counts — otherwise the highest-ranked person wins by showing up.",
          "Let people enter more than one. A single account can be in as many challenges as it likes, and one good week moves every board at once.",
          "Post the standings weekly. A leaderboard nobody sees is a database table.",
        ],
      },

      { kind: "h2", text: "The honest limitations" },
      {
        kind: "ul",
        items: [
          "Game APIs rate-limit. Stats refresh on a schedule, not instantly — finish a match and check two seconds later and you may see the previous number.",
          "Some games expose less than you'd like. Mobile titles in particular are inconsistent about what's public.",
          "Anyone can link any account they can name. Verification is as good as the game's own API allows, and no better.",
        ],
      },
      { kind: "p", text: "Those are real, and anyone who tells you otherwise is selling something." },

      { kind: "cta", text: "ClusterBot is free, installs in one click and covers {games} games.", href: "/discord-bot", label: "See what it puts in your channel" },
    ],
  },

  {
    slug: "discord-engagement-ideas-that-actually-work",
    title: "11 Discord engagement ideas that actually work (and 4 that don't)",
    category: "Run a better server",
    description:
      "Tested ways to bring a quiet gaming Discord back to life — competitions, recognition, rituals — plus the popular ideas that reliably fail and why.",
    question: "How do I make my Discord server more active?",
    answer:
      "Give people a reason to return on a schedule and a way to be seen when they do. Recurring competitions with visible standings work best, followed by public recognition of individual members. Bump bots, giveaways for unrelated prizes, and adding more channels reliably fail — they add noise without adding a reason to come back.",
    published: "2026-07-22",
    readMinutes: 8,
    tags: ["discord", "community", "engagement"],
    cover: "/api/card/leaderboard?preview=1",
    related: ["how-discord-servers-make-money", "how-to-track-game-stats-in-discord"],
    body: [
      { kind: "p", text: "A quiet server is rarely a people problem. It's usually that there's no reason to open the app today that wasn't equally true yesterday. Everything below is an attempt to create that reason." },

      { kind: "h2", text: "What works" },
      { kind: "h3", text: "1. A recurring competition with a visible standing" },
      { kind: "p", text: "The single highest-return thing you can run. Weekly beats monthly — a week is short enough that someone behind on day two can still catch up, and a monthly leaderboard gets decided in week one and ignored for three." },
      { kind: "h3", text: "2. Automatic recognition" },
      { kind: "p", text: "Post when someone hits a milestone. It costs nothing, it's the cheapest dopamine available, and it makes the server feel like it's paying attention to individuals rather than the other way round." },
      { kind: "h3", text: "3. A ritual with a fixed time" },
      { kind: "p", text: "Friday night stack. Sunday review. Anything that repeats at a time people can plan around. Ad-hoc events get a fraction of the turnout of scheduled ones, purely because nobody knew." },
      { kind: "h3", text: "4. A visible newcomer path" },
      { kind: "p", text: "Most people who leave a Discord leave in the first ten minutes, having read nothing and spoken to nobody. One pinned message saying exactly what to do first converts more of them than any welcome bot." },
      { kind: "h3", text: "5. Let people show off" },
      { kind: "p", text: "Ranks, stats, collections, setups. This works because people don't come back for a server — they come back for the version of themselves the server reflects." },
      { kind: "h3", text: "6. Cross-game competition" },
      { kind: "p", text: "Most gaming Discords are secretly several communities that don't talk. A points system spanning games gives the Valorant half and the League half a reason to be in the same conversation." },
      { kind: "h3", text: "7. Ask questions with cheap answers" },
      { kind: "p", text: "\"What are you playing tonight\" gets ten replies. \"What do you think about the meta\" gets zero, because it requires composing a paragraph." },
      { kind: "h3", text: "8. Give real prizes, rarely" },
      { kind: "p", text: "One meaningful prize a quarter beats a trivial prize weekly. Trivial prizes teach people that winning isn't worth the effort, which is the opposite of the lesson you want." },
      { kind: "h3", text: "9. Promote members into responsibility" },
      { kind: "p", text: "The most engaged member of any community is the one who feels responsible for part of it. Give away ownership of something small and specific." },
      { kind: "h3", text: "10. Fewer channels" },
      { kind: "p", text: "A server with 40 channels and 200 members has no active channels. Conversation needs density. Archive ruthlessly." },
      { kind: "h3", text: "11. Show the server's own numbers" },
      { kind: "p", text: "Communities like being part of something measurable. \"We're 340 linked gamers across six games\" is a fact people repeat when they invite friends." },

      { kind: "figure", src: "/api/card/leaderboard?preview=1", alt: "A live leaderboard card showing ranked members of a server", caption: "The standings, as a card. A leaderboard people can see is a leaderboard people play for." },

      { kind: "ad" },

      { kind: "h2", text: "What doesn't" },
      {
        kind: "ul",
        items: [
          "Bump bots. They bring people who joined a list, not a community, and they leave within the day.",
          "Giveaways for unrelated prizes. You get entrants, not members. The Nitro giveaway crowd is a well-known nomadic population.",
          "Adding channels to fix silence. Silence in one channel becomes silence in six.",
          "@everyone as an engagement tool. It works exactly twice, then it becomes the reason people mute the server.",
        ],
      },

      { kind: "h2", text: "The pattern underneath all of it" },
      { kind: "p", text: "Everything on the works list gives someone a reason to be seen. Everything on the doesn't list adds volume without adding a reason. When you're deciding whether an idea belongs, that's the question: after this, is there anyone in the server who is more visible than they were before?" },

      { kind: "cta", text: "Cluster runs the competition half of this automatically — leaderboards, challenges and recognition, from the games your members already play.", href: "/discord-bot", label: "See it in a channel" },
    ],
  },

  {
    slug: "best-discord-bots-for-gaming-communities",
    title: "The best Discord bots for gaming communities in 2026",
    category: "Run a better server",
    description:
      "An honest comparison of the bot categories every gaming Discord ends up needing — moderation, levelling, music, stats and competition — with what each is genuinely for.",
    question: "What are the best Discord bots for a gaming server?",
    answer:
      "Most gaming servers need four: a moderation bot, a levelling bot, a stats bot that reads the games' official APIs, and something that runs competitions. Moderation and levelling are commodity categories with several good options. Stats and competition are where a gaming server differs from any other server, and where the choice actually matters.",
    published: "2026-07-23",
    readMinutes: 6,
    tags: ["discord", "bots", "comparison"],
    cover: "/api/card/guide?topic=getting-started",
    related: ["how-to-track-game-stats-in-discord", "discord-engagement-ideas-that-actually-work"],
    body: [
      { kind: "p", text: "We build one of these, so read this knowing that. What follows is the category breakdown we'd give a friend, including the parts where our answer isn't the right one." },

      { kind: "h2", text: "Moderation — a commodity, pick any" },
      { kind: "p", text: "Auto-moderation, raid protection, logging, role management. Mature category, and the good options are close enough that the tie-breaker is whichever dashboard you find least annoying. Set it up once and stop thinking about it." },

      { kind: "h2", text: "Levelling — useful, easy to overdo" },
      { kind: "p", text: "XP for messages, roles at thresholds. It works because it makes participation visible. It fails when the reward is only more XP: at that point you've built a treadmill, and treadmills are quiet after a month." },
      { kind: "p", text: "If you run one, tie at least one level to something real — a channel, a responsibility, an actual perk." },

      { kind: "h2", text: "Music — check whether it still exists" },
      { kind: "p", text: "This category has been repeatedly disrupted by rightsholder action. Whatever is popular when you read this may not be running in six months. Don't build a ritual around it." },

      { kind: "h2", text: "Game stats — where gaming servers differ" },
      { kind: "p", text: "A bot that reads the games' official APIs and puts real numbers in the channel. This is the category where a gaming Discord is different from a study Discord, and where it's worth spending your attention." },
      { kind: "p", text: "What to actually compare:" },
      {
        kind: "ul",
        items: [
          "Which games. A bot covering one game is fine if your server plays one game, and useless the moment it doesn't.",
          "Whether stats are verified or typed in. Self-reported stats are decoration.",
          "What linking costs a member. If it means leaving Discord for a web form, most of your members won't finish.",
          "What it looks like. A wall of monospaced text gets ignored; a rendered card gets screenshotted.",
        ],
      },
      { kind: "p", text: "Cluster covers {games} games, links accounts through a form inside Discord, and renders everything as cards with working buttons underneath. It's the strongest fit when your members play several different games — the cross-game profile is the whole point — and a weaker fit if your server plays exactly one game that already has a great dedicated bot." },

      { kind: "ad" },

      { kind: "h2", text: "Competition — the one most servers skip" },
      { kind: "p", text: "Tournaments, challenges, leaderboards with something at stake. Most servers run this by hand in a spreadsheet and stop within two months. Automating it is the difference between a competition that happens once and a competition that becomes a habit." },
      { kind: "p", text: "The thing to check is whether standings move on verified data. A competition scored from screenshots is a competition your most honest members will lose." },
      { kind: "p", text: "The second thing to check is who funds the prize. If it's you, it's a marketing cost with a ceiling. On Cluster the prize is funded by the brand sponsoring the challenge — {prize} of the {price} they pay — and your server takes a share of the rest once it's connected enough gamers." },

      { kind: "h2", text: "What we'd install on a new gaming server" },
      {
        kind: "ol",
        items: [
          "One moderation bot, configured once.",
          "One levelling bot, with at least one level that grants something real.",
          "One stats-and-competition bot, chosen by which games your members actually play.",
        ],
      },
      { kind: "p", text: "Three. Not eleven. Every extra bot is another set of commands your members have to learn and another thing that breaks silently." },

      { kind: "cta", text: "See exactly what Cluster puts in a channel before you decide.", href: "/discord-bot", label: "Open the live demo" },
    ],
  },
];

export function postBySlug(slug: string): BlogPost | null {
  return POSTS.find((p) => p.slug === slug) ?? null;
}

export function relatedPosts(post: BlogPost): BlogPost[] {
  return post.related.map(postBySlug).filter((p): p is BlogPost => !!p);
}

/** Newest first, which is the only order an index should ever default to. */
export function sortedPosts(): BlogPost[] {
  return [...POSTS].sort((a, b) => b.published.localeCompare(a.published));
}

export function postsByCategory(): { category: Category; posts: BlogPost[] }[] {
  return CATEGORIES
    .map((category) => ({ category, posts: sortedPosts().filter((p) => p.category === category) }))
    .filter((g) => g.posts.length > 0);
}
