import { getDb } from "@/lib/db";
import { getUserQuests } from "@/lib/quests";
import { getContent } from "@/lib/cms";
import { cardBg } from "@/lib/cards/data";
import { slimImg } from "@/lib/img";
import type { CardData, GuideCard } from "@/lib/cards/types";

// The how-to guide cards the bot posts and PINS in #ClusterGG on install.
// Every field is admin-overridable from Mission Control → Discord → Guides via
// CMS keys, so staff can rewrite any guide without a deploy:
//   bot.guide.<topic>.title | .subtitle | .steps (JSON) | .footer | .bg | .accent
// Quest guides are generated live from each quest's real tiers + art, and can be
// overridden per quest with the same key pattern (topic = `quest:<key>`).

export type GuideTopic = { title: string; subtitle: string; badge: string; steps: { title: string; body: string }[]; footer: string };

export const GUIDE_TOPICS: Record<string, GuideTopic> = {
  "getting-started": {
    title: "Welcome to Cluster",
    subtitle: "Every game. One identity.",
    badge: "START HERE",
    footer: "Type /cluster to see everything",
    steps: [
      { title: "Create your profile", body: "Run /cluster show — sign in with Discord and your cosmic profile is created instantly." },
      { title: "Link a game account", body: "Run /cluster link and pick your game. Stats sync automatically from the official API." },
      { title: "Explore a planet", body: "Run /cluster planet and pick a game to see its challenges, leaderboard and top gamers." },
      { title: "Earn Cluster Points", body: "Every action earns CP across four quests. Climb from Bronze to Platinum." },
    ],
  },
  "connect-account": {
    title: "Connect a game account",
    subtitle: "Real stats, verified by API — never self-reported",
    badge: "CONNECT",
    footer: "/cluster link",
    steps: [
      { title: "Run /cluster link", body: "Choose your game from the list — 24 games are supported." },
      { title: "Enter your in-game name", body: "Fill the short form with your tag and region. That's the whole setup." },
      { title: "Stats sync automatically", body: "Rank, wins, KDA and more are pulled from the official game API and stay live." },
      { title: "Unlock quests + challenges", body: "A linked account lets you join challenges and earn CP toward every quest." },
    ],
  },
  "customize-profile": {
    title: "Customize your profile",
    subtitle: "Make it unmistakably yours",
    badge: "CUSTOMIZE",
    footer: "clustergg.com/profile",
    steps: [
      { title: "Open the builder", body: "Head to clustergg.com/profile — every colour, card and layout is yours to shape." },
      { title: "Set cover + avatar", body: "Upload a cover, pick an avatar shape, and choose your accent colours." },
      { title: "Arrange your sections", body: "Reorder accounts, quests, trophies and challenges — hide what you don't want." },
      { title: "Share it and get votes", body: "Share your link — signed-in gamers can vote for your profile on the platform." },
    ],
  },
  "challenges": {
    title: "How challenges work",
    subtitle: "Real-data competitions. No screenshots.",
    badge: "COMPETE",
    footer: "/cluster challenge",
    steps: [
      { title: "Find a challenge", body: "Run /cluster challenge and pick a game to see everything live right now." },
      { title: "Join with one tap", body: "Your stats are snapshotted when you join — only NEW activity counts." },
      { title: "Climb the standings", body: "Every sync pulls fresh data from the game API and the board updates live." },
      { title: "Win real trophies", body: "Podium finishers earn trophies with real dollar values, redeemable from your profile." },
    ],
  },
  // The two screens that used to be the bot's only card-less messages: More
  // and Commands. Every other reply arrives as art with buttons under it, so a
  // plain wall of text read as the bot having broken rather than as a menu.
  "everything": {
    title: "Everything Cluster does",
    subtitle: "One identity, every game you play",
    badge: "THE MAP",
    footer: "Every button below edits this message",
    // Eight, because the card is called "everything" and used to list four.
    // The renderer lays 5-8 out in two columns.
    // Bodies are kept SHORT on purpose. Eight steps means two columns, and a
    // two-column body has room for about one line — so the command at the end
    // has to survive the truncation, which is the only part that's actionable.
    steps: [
      { title: "Your profile", body: "Every game, rank and trophy on one card. /cluster" },
      { title: "Planets", body: "A world per game. /cluster planet" },
      { title: "Challenges", body: "Real-data contests, real trophies. /cluster challenges" },
      { title: "Leaderboards", body: "Every board, from the game APIs. /cluster leaderboard" },
      { title: "Quests", body: "Cluster Points, Bronze to Platinum. /cluster quests" },
      { title: "Profile of the Week", body: "The platform votes. Sunday on stream. /cluster week" },
      { title: "Trophies", body: "Podiums pay real value. /cluster trophies" },
      { title: "Your server", body: "Growth and revenue share. /cluster server" },
    ],
  },
  "commands": {
    title: "How to use this bot",
    subtitle: "One command. One box.",
    badge: "COMMANDS",
    footer: "/cluster",
    steps: [
      { title: "Type /cluster", body: "That's your own card — profile, Cluster Points, and a button for every game you've linked." },
      { title: "Type /cluster <anything>", body: "A game, a quest, a guide or a gamer's name. The suggestions are live, so whatever exists is typeable." },
      { title: "Press the buttons", body: "Every button edits the same message instead of posting a new one, so the channel stays clean." },
      { title: "Everything is shareable", body: "Type /cluster share to post your card publicly — it's the only reply anyone else can see." },
    ],
  },
  "best-profile": {
    title: "Best Profile award",
    subtitle: "The most-voted profile in the Cluster",
    badge: "IDENTITY",
    footer: "Vote on clustergg.com",
    steps: [
      { title: "Build a profile worth voting for", body: "Customize your layout, colours and cards until it's unmistakably you." },
      { title: "Share your link", body: "Post your profile in this channel with /cluster share to collect votes." },
      { title: "Voting happens on the platform", body: "Signed-in gamers vote from your profile page — one vote each, on the website." },
      { title: "Climb the Best Profile board", body: "The most-voted profiles are featured on the Cluster homepage." },
    ],
  },
};

// A single guide card, with admin CMS overrides applied.
export async function guideCard(topic: string, questKey?: string | null): Promise<CardData | null> {
  // Per-quest guide: generated from the quest's live tiers + art.
  if (topic === "quest" || topic.startsWith("quest:")) {
    const key = topic.startsWith("quest:") ? topic.slice(6) : (questKey ?? "");
    return questGuideCard(key);
  }

  const base = GUIDE_TOPICS[topic];
  if (!base) return null;
  const keys = [`bot.guide.${topic}.title`, `bot.guide.${topic}.subtitle`, `bot.guide.${topic}.steps`, `bot.guide.${topic}.footer`, `bot.guide.${topic}.bg`, `bot.guide.${topic}.accent`];
  const [c, bg] = await Promise.all([
    getContent(keys).catch(() => ({} as Record<string, string>)),
    cardBg("bot_guide"),
  ]);

  let steps = base.steps;
  const raw = c[`bot.guide.${topic}.steps`];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        steps = parsed.filter((s) => s && s.title).map((s) => ({ title: String(s.title), body: String(s.body ?? "") }));
      }
    } catch { /* keep defaults */ }
  }

  const accent = c[`bot.guide.${topic}.accent`] || "#8b5cf6";
  const card: GuideCard = {
    kind: "guide",
    title: c[`bot.guide.${topic}.title`] || base.title,
    subtitle: c[`bot.guide.${topic}.subtitle`] || base.subtitle,
    badge: base.badge,
    steps,
    footer: c[`bot.guide.${topic}.footer`] || base.footer,
    theme: { accent, accent2: "#22d3ee", bgUrl: c[`bot.guide.${topic}.bg`] || bg.bgUrl },
  };
  return card;
}

// "How to win this quest" — built from the quest's real milestones and art.
export async function questGuideCard(questKey: string): Promise<CardData | null> {
  const db = await getDb();
  const quests = await getUserQuests(db, null);
  const q = quests.find((x) => x.key.toLowerCase() === questKey.toLowerCase() || x.name.toLowerCase() === questKey.toLowerCase());
  if (!q) return null;

  const topic = `quest:${q.key}`;
  const keys = [`bot.guide.${topic}.title`, `bot.guide.${topic}.subtitle`, `bot.guide.${topic}.steps`, `bot.guide.${topic}.footer`, `bot.guide.${topic}.bg`];
  const [c, bg] = await Promise.all([
    getContent(keys).catch(() => ({} as Record<string, string>)),
    cardBg("bot_guide"),
  ]);

  // EVERY way to earn CP on this quest, not a sample. A guide that lists two of
  // six actions is worse than no guide — people conclude the other four don't
  // pay. They're packed into one step so a quest with eight actions still fits.
  const ladder = q.tiers.map((t) => `${t.name} ${t.thresholdQp.toLocaleString()}`).join(" · ");
  const earnLines = q.rules
    .map((r) => `+${r.points} ${r.label}${r.cap ? ` (max ${r.cap}/day)` : ""}`)
    .join(" · ");

  let steps = [
    { title: "What this quest rewards", body: q.lore || q.tagline },
    { title: `Every way to earn CP here (${q.rules.length})`, body: earnLines || "Scoring for this quest is being set up." },
    { title: "Milestones", body: ladder || "Climb each tier to unlock its badge." },
  ];

  const raw = c[`bot.guide.${topic}.steps`];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) steps = parsed.filter((s) => s && s.title).map((s) => ({ title: String(s.title), body: String(s.body ?? "") }));
    } catch { /* keep generated */ }
  }

  const card: GuideCard = {
    kind: "guide",
    title: c[`bot.guide.${topic}.title`] || `${q.name} — how to win`,
    subtitle: c[`bot.guide.${topic}.subtitle`] || q.tagline,
    badge: "QUEST GUIDE",
    logoUrl: slimImg(q.logoUrl, 300000),
    steps,
    footer: c[`bot.guide.${topic}.footer`] || `/cluster quest ${q.key}`,
    theme: { accent: q.color, accent2: q.accent2, bgUrl: c[`bot.guide.${topic}.bg`] || slimImg(q.cardBgUrl ?? q.mapArtUrl, 800000) || bg.bgUrl },
  };
  return card;
}

// Every guide the bot pins on install: the four evergreen ones + one per quest.
export async function allGuideTopics(): Promise<{ topic: string; label: string }[]> {
  const out = Object.keys(GUIDE_TOPICS).map((t) => ({ topic: t, label: GUIDE_TOPICS[t].title }));
  try {
    const db = await getDb();
    const quests = await getUserQuests(db, null);
    for (const q of quests) out.push({ topic: `quest:${q.key}`, label: `${q.name} — how to win` });
  } catch { /* quests unavailable */ }
  return out;
}
