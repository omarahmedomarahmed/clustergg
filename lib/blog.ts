// The blog.
//
// Written as content, kept in the repo rather than the database, for one
// reason: these posts are the SEO surface and they need to be reviewable in a
// diff. A CMS-editable blog is a blog nobody can code-review, and a
// hallucinated statistic in a post that ranks is worse than no post.
//
// Every post follows the same rule: it has to be worth reading if you never
// install anything. The bot appears where it's genuinely the answer, and is
// named plainly rather than smuggled in — a reader who feels sold to leaves,
// and a reader who feels helped comes back.

export type BlogSection =
  | { kind: "p"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "cta"; text: string; href: string; label: string }
  | { kind: "table"; head: string[]; rows: string[][] };

export type BlogPost = {
  slug: string;
  title: string;
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
  body: BlogSection[];
  /** Internal links. Every post links to at least two others and to the
   *  product page — orphan pages don't rank and don't get read. */
  related: string[];
};

export const POSTS: BlogPost[] = [
  {
    slug: "how-to-track-game-stats-in-discord",
    title: "How to track game stats inside Discord (without anyone leaving the server)",
    description:
      "A practical guide to putting live League, Valorant, Apex, CS2 and Fortnite stats into a Discord server — what the options are, what each one costs you, and how to set it up in about a minute.",
    question: "How do I show game stats in a Discord server?",
    answer:
      "Add a bot that reads the games' official APIs and renders stats as images in the channel. ClusterBot does this for 24 games: members link a game account once with a slash command, and their rank, wins and recent matches render as a card in Discord with buttons to navigate. It's free, takes one click to install, and needs no configuration.",
    published: "2026-07-20",
    readMinutes: 7,
    tags: ["discord", "guide", "game stats"],
    related: ["discord-engagement-ideas-that-actually-work", "how-discord-servers-make-money"],
    body: [
      { kind: "p", text: "Every gaming Discord eventually hits the same wall. Someone posts a screenshot of their rank. Someone else disputes it. A third person asks who's actually the best in the server, and nobody can answer, because the only record is a scroll-back full of cropped screenshots." },
      { kind: "p", text: "The fix is to put real, verifiable stats in the channel. Here's how the options actually compare." },

      { kind: "h2", text: "Option 1: screenshots and an honour system" },
      { kind: "p", text: "Free, instant, and worthless the moment anything is at stake. A screenshot proves nothing — it can be old, cropped, or someone else's. If you're running anything with a prize, this is the option that ends in an argument." },

      { kind: "h2", text: "Option 2: a spreadsheet someone maintains" },
      { kind: "p", text: "This works for about three weeks. It works because one person is doing unpaid data entry, and it stops working the day that person gets bored. Every community that has tried this knows exactly which week it died." },

      { kind: "h2", text: "Option 3: a bot that reads the game's own API" },
      { kind: "p", text: "This is the only version that survives contact with a real community, because nobody has to do anything for it to keep working. The game's API is the source of truth, the bot reads it on a schedule, and the numbers are the same numbers the game shows." },
      { kind: "p", text: "The tradeoff is that it only works for games with a public API. That's most of the big ones — Riot covers League and Valorant, Steam covers CS2 and playtime, and Apex, Fortnite, PUBG, osu!, Chess.com and Lichess all expose ranked data — but it's not everything." },

      { kind: "h2", text: "Setting it up with ClusterBot" },
      { kind: "p", text: "Cluster is the bot we build, so treat this section as what it is: the specific instructions for our tool. The general approach above applies whatever you use." },
      {
        kind: "ol",
        items: [
          "Add the bot to your server. It asks for the permissions it uses and nothing more — it never reads message content, and it can't, because we don't request that intent.",
          "It creates a #clustergg channel and pins a how-to card for every part of the product. Nobody has to be told a command exists.",
          "A member types /cluster and taps Connect a game. A form opens inside Discord — they type their in-game name, and that's the entire setup.",
          "From then on their rank, wins, champions and recent matches render as a card in the channel, updated on every sync.",
        ],
      },
      { kind: "p", text: "There's no dashboard to configure and no webhook to wire. The reason it's one click is that a bot needing a setup call is a bot that never gets installed." },

      { kind: "h2", text: "What to do once the stats are there" },
      { kind: "p", text: "Stats on their own are a novelty. What makes them stick is competition against them:" },
      {
        kind: "ul",
        items: [
          "Run a leaderboard per metric your community actually argues about — rank is obvious, but win rate, KD and hours are often the ones people care about more.",
          "Start a challenge with a real prize. The important detail is that stats are snapshotted the moment someone joins, so only new activity counts — otherwise the highest-ranked person wins by showing up.",
          "Post the standings weekly. A leaderboard nobody sees is a database table.",
        ],
      },

      { kind: "h2", text: "The honest limitations" },
      {
        kind: "ul",
        items: [
          "Game APIs rate-limit. Stats refresh on a schedule, not instantly — if someone finishes a match and checks two seconds later, they may see the previous number.",
          "Some games expose less than you'd like. Mobile titles in particular are inconsistent about what's public.",
          "Anyone can link any account they can name. Verification is as good as the game's own API allows, and no better.",
        ],
      },
      { kind: "p", text: "Those are real, and anyone who tells you otherwise is selling something." },

      { kind: "cta", text: "ClusterBot is free, installs in one click and works in 24 games.", href: "/discord-bot", label: "See what it puts in your channel" },
    ],
  },

  {
    slug: "how-discord-servers-make-money",
    title: "How Discord servers actually make money in 2026",
    description:
      "Every real revenue model for a Discord community — server subscriptions, sponsorships, affiliate deals, paid roles and ad revenue share — with what each one requires and roughly what it pays.",
    question: "How can I make money from my Discord server?",
    answer:
      "The five models that work are Discord's own Server Subscriptions, direct brand sponsorships, affiliate links, paid roles for perks, and revenue share from a platform that monetises your audience. Sponsorships pay the most but need a media kit and reliable numbers; revenue share pays less but requires nothing beyond keeping the community active.",
    published: "2026-07-21",
    readMinutes: 9,
    tags: ["discord", "monetization", "community"],
    related: ["how-to-track-game-stats-in-discord", "discord-engagement-ideas-that-actually-work"],
    body: [
      { kind: "p", text: "Running a big Discord is a real job that mostly pays nothing. Here's an honest survey of the ways that actually work, including ours, and what each one costs you." },

      { kind: "h2", text: "1. Server Subscriptions (Discord's own)" },
      { kind: "p", text: "Discord lets eligible servers sell monthly memberships and takes a cut. It's the lowest-friction option because the payment rails already exist and members never leave the app." },
      { kind: "p", text: "The catch is what you're selling. A subscription needs a perk people would miss, which usually means a private channel, early access, or something you personally provide — and that something becomes a recurring obligation. Plenty of servers launch a subscription and quietly abandon it three months later because the perk turned into homework." },

      { kind: "h2", text: "2. Brand sponsorships" },
      { kind: "p", text: "The highest-paying option by a wide margin, and the hardest to land. A brand is buying reach and relevance, so you need numbers you can prove and an audience that matches what they sell." },
      {
        kind: "ul",
        items: [
          "You need real, checkable metrics — member count, weekly active members, message volume, and ideally what your members actually play.",
          "You need a media kit. One page: who your community is, how many, how engaged, and what a sponsorship gets them.",
          "You need to deliver something measurable. \"We'll mention you\" is worth much less than \"we ran a tournament with your prize and here are the entrants.\"",
        ],
      },
      { kind: "p", text: "Most servers stall on the first point. Discord's own analytics are thin, and \"we have 12,000 members\" means nothing when a third of them joined for one giveaway in 2024." },

      { kind: "h2", text: "3. Affiliate links" },
      { kind: "p", text: "Easy to start, easy to overdo. Works when the product is something your community was going to buy anyway — peripherals, game keys, a service they already use. It stops working the moment members feel they're being farmed, and that damage is not easily undone." },

      { kind: "h2", text: "4. Paid roles" },
      { kind: "p", text: "A one-off or recurring payment for a coloured role, a custom flair, or access to something cosmetic. It works better than it sounds, because it's a status purchase rather than a utility purchase — people are buying visibility among people they know." },
      { kind: "p", text: "Keep it cosmetic. The moment a paid role grants an advantage in something competitive, you've turned your community into a pay-to-win game and the people who lose are the ones who made it worth joining." },

      { kind: "h2", text: "5. Revenue share from a platform" },
      { kind: "p", text: "Some platforms monetise the audience for you and pass back a share. This is what Cluster does, and it's fair to say that's why we're writing about it — so here are the actual terms rather than a pitch." },
      {
        kind: "table",
        head: ["Linked members", "What unlocks"],
        rows: [
          ["From day one", "Private challenges for your community, and a public server page with your logo and invite"],
          ["500", "A share of the ad revenue Cluster earns from your community"],
          ["1,000", "You can carry other servers' challenges, and are paid to"],
          ["5,000", "Brands sponsor challenges directly in your server and you keep the whole fee"],
        ],
      },
      { kind: "p", text: "\"Linked members\" means members who joined Cluster and connected a game account — not raw member count. That's deliberate: an advertiser is paying for people who demonstrably play the games they're advertising to, and a headline member count doesn't establish that. It also means the number is slower to reach and worth more when you get there." },
      { kind: "p", text: "The tradeoff is that it pays less than a direct sponsorship for the same audience. What you're buying with that difference is not having to sell anything." },

      { kind: "h2", text: "What we'd actually recommend" },
      { kind: "p", text: "If your server is under a few thousand members, chase engagement rather than revenue. Every model above pays proportionally to how alive the community is, and none of them fix a quiet server." },
      { kind: "p", text: "Above that, run two in parallel: something passive that pays without ongoing work, and one direct sponsorship attempt per quarter. The passive one funds the effort of the direct one." },

      { kind: "cta", text: "Cluster's revenue share starts at 500 linked members, and the counter is visible from day one.", href: "/discord-bot", label: "See how the tiers work" },
    ],
  },

  {
    slug: "discord-engagement-ideas-that-actually-work",
    title: "11 Discord engagement ideas that actually work (and 4 that don't)",
    description:
      "Tested ways to bring a quiet gaming Discord back to life — competitions, recognition, rituals — plus the popular ideas that reliably fail and why.",
    question: "How do I make my Discord server more active?",
    answer:
      "Give people a reason to return on a schedule and a way to be seen when they do. Recurring competitions with visible standings work best, followed by public recognition of individual members. Bump bots, giveaways for unrelated prizes, and adding more channels reliably fail — they add noise without adding reasons to come back.",
    published: "2026-07-22",
    readMinutes: 8,
    tags: ["discord", "community", "engagement"],
    related: ["how-discord-servers-make-money", "how-to-track-game-stats-in-discord"],
    body: [
      { kind: "p", text: "A quiet server is rarely a people problem. It's usually that there's no reason to open the app today that wasn't equally true yesterday. Everything below is an attempt to create that reason." },

      { kind: "h2", text: "What works" },
      { kind: "h3", text: "1. A recurring competition with a visible standing" },
      { kind: "p", text: "The single highest-return thing you can run. Weekly beats monthly — a week is short enough that someone behind on day two can still catch up, and monthly leaderboards get decided in the first week and ignored for three." },
      { kind: "h3", text: "2. Automatic recognition" },
      { kind: "p", text: "Post when someone hits a milestone. It costs nothing, it's the cheapest possible dopamine, and it makes the server feel like it's paying attention to individuals rather than the other way round." },
      { kind: "h3", text: "3. A ritual with a fixed time" },
      { kind: "p", text: "Friday night stack. Sunday review. Anything that repeats at a time people can plan around. Ad-hoc events get 20% of the turnout of scheduled ones purely because nobody knew." },
      { kind: "h3", text: "4. A visible newcomer path" },
      { kind: "p", text: "Most people who leave a Discord leave in the first ten minutes, having read nothing and spoken to nobody. One pinned message that says exactly what to do first converts more of them than any welcome bot." },
      { kind: "h3", text: "5. Let people show off" },
      { kind: "p", text: "Ranks, stats, collections, setups. The reason this works is that people don't come back for a server — they come back for the version of themselves the server reflects." },
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
      { kind: "p", text: "Communities like being part of something measurable. \"We're 340 linked gamers across 6 games\" is a fact people repeat when they invite friends." },

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
    description:
      "An honest comparison of the bot categories every gaming Discord ends up needing — moderation, levelling, music, stats and competition — with what each is genuinely for.",
    question: "What are the best Discord bots for a gaming server?",
    answer:
      "Most gaming servers need four: a moderation bot, a levelling bot, a stats bot that reads the games' official APIs, and something that runs competitions. Moderation and levelling are commodity categories with several good options. Stats and competition are where a gaming server differs from any other server, and where the choice actually matters.",
    published: "2026-07-23",
    readMinutes: 6,
    tags: ["discord", "bots", "comparison"],
    related: ["how-to-track-game-stats-in-discord", "discord-engagement-ideas-that-actually-work"],
    body: [
      { kind: "p", text: "We build one of these, so read this knowing that. What follows is the category breakdown we'd give a friend, including the parts where our answer isn't the right one." },

      { kind: "h2", text: "Moderation — a commodity, pick any" },
      { kind: "p", text: "Auto-moderation, raid protection, logging, role management. This category is mature and the good options are close enough that the tie-breaker is whichever dashboard you find least annoying. Set it up once and stop thinking about it." },

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
          "What linking costs a member. If it requires leaving Discord for a web form, most of your members will not finish.",
          "What it looks like. A wall of monospaced text gets ignored; a rendered card gets screenshotted.",
        ],
      },
      { kind: "p", text: "Cluster covers 24 games, links accounts through a form inside Discord, renders everything as cards with working buttons underneath, and is free. It's the strongest fit when your members play several different games — the cross-game profile is the whole point — and a weaker fit if your server plays exactly one game that has a great dedicated bot already." },

      { kind: "h2", text: "Competition — the one most servers skip" },
      { kind: "p", text: "Tournaments, challenges, leaderboards with something at stake. Most servers run this by hand in a spreadsheet and stop within two months. Automating it is the difference between a competition that happens once and a competition that becomes a habit." },
      { kind: "p", text: "The thing to check is whether standings move on verified data. A competition scored from screenshots is a competition your most honest members will lose." },

      { kind: "h2", text: "What we'd install on a new gaming server" },
      {
        kind: "ol",
        items: [
          "One moderation bot, configured once.",
          "One levelling bot, with at least one level that grants something real.",
          "One stats-and-competition bot, chosen by which games your members actually play.",
        ],
      },
      { kind: "p", text: "Three. Not eleven. Every additional bot is another set of commands your members have to learn and another thing that breaks silently." },

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
