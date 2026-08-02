import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { BotStep } from "@/components/BotShowcase";

// The steps behind "how the bot works", built from REAL data.
//
// The point of showing our own cards is that they're the real ones — so this
// picks a real profile, a real live challenge and a real game rather than
// inventing them. When there's nothing real to show yet (a fresh install, an
// empty database) the step is dropped rather than filled with a fake, because
// a demo showing a challenge that doesn't exist is the fastest way to lose a
// server owner who then goes looking for it.

async function pick(): Promise<{ slug: string | null; game: string | null; challengeId: string | null }> {
  try {
    const db = await getDb();
    const [profiles, games, challenges] = await Promise.all([
      // A profile with custom art shows the card at its best, which is the
      // honest thing to show — it's what a member's card looks like once they
      // care about it.
      db.select({ slug: schema.users.slug, banner: schema.users.bannerUrl })
        .from(schema.users).orderBy(desc(schema.users.voteCount), desc(schema.users.profileViews)).limit(8),
      db.select({ name: schema.games.name }).from(schema.games)
        .where(eq(schema.games.isActive, true)).limit(40),
      db.select({ id: schema.challenges.id }).from(schema.challenges)
        .where(eq(schema.challenges.status, "active")).orderBy(desc(schema.challenges.startAt)).limit(1),
    ]);
    return {
      slug: (profiles.find((p) => p.banner) ?? profiles[0])?.slug ?? null,
      // League of Legends leads the demo on purpose: it is the deepest
      // integration we have (rank, mastery, live match, recent games), so its
      // cards are the ones that actually prove what the bot does. Whichever
      // game happened to be first in the catalogue was an accident of seeding.
      game: (games.find((g) => /league of legends/i.test(g.name)) ?? games[0])?.name ?? null,
      challengeId: challenges[0]?.id ?? null,
    };
  } catch {
    return { slug: null, game: null, challengeId: null };
  }
}

export async function botShowcaseSteps(): Promise<BotStep[]> {
  const { slug, game, challengeId } = await pick();
  const q = (s: string) => encodeURIComponent(s);
  const steps: BotStep[] = [];

  steps.push({
    id: "start",
    trigger: "/cluster",
    title: "Welcome to Cluster",
    body: "Posted and pinned the moment the bot joins. Nobody has to be told a command exists.",
    card: "/api/card/guide?topic=getting-started",
    buttons: [
      { label: "START HERE", emoji: "🚀", style: "primary", to: "planets" },
      { label: "Connect a game", emoji: "🎮", style: "success", to: "link" },
      { label: "How it works", emoji: "📖", style: "secondary" },
    ],
  });

  steps.push({
    id: "planets",
    trigger: "START HERE",
    title: "Pick your game",
    body: "Every game we sync is a world with its own challenges, leaderboards and top gamers.",
    card: "/api/card/planets",
    buttons: [
      ...(game ? [{ label: game, emoji: "🪐", style: "primary" as const, to: "planet" }] : []),
      { label: "Connect a game", emoji: "🎮", style: "success" as const, to: "link" },
      { label: "More", emoji: "🧭", style: "secondary" as const },
      { label: "Back", emoji: "◀", style: "secondary" as const, to: "start" },
    ],
  });

  if (game) {
    steps.push({
      id: "planet",
      trigger: `/cluster show:planet game:${game}`,
      title: `${game} Planet`,
      body: "Live challenges, the leaderboard, and how many of your members are ranked on it.",
      card: `/api/card/planet?game=${q(game)}`,
      buttons: [
        { label: "Challenges", emoji: "🏆", style: "primary", to: challengeId ? "challenge" : "leaderboard" },
        { label: "Leaderboard", emoji: "📊", style: "secondary", to: "leaderboard" },
        { label: "Connect a game", emoji: "🎮", style: "success", to: "link" },
        { label: "Back", emoji: "◀", style: "secondary", to: "planets" },
      ],
    });

    steps.push({
      id: "leaderboard",
      trigger: `/cluster show:leaderboard game:${game}`,
      title: `${game} leaderboard`,
      body: "Standings from the official game API, refreshed on every sync. Nothing is self-reported.",
      card: `/api/card/leaderboard?game=${q(game)}`,
      buttons: [
        { label: `${game} planet`, emoji: "🪐", style: "primary", to: "planet" },
        { label: "My profile", emoji: "👤", style: "secondary", to: slug ? "profile" : "link" },
        { label: "Back", emoji: "◀", style: "secondary", to: "planet" },
      ],
    });
  }

  if (challengeId) {
    steps.push({
      id: "challenge",
      trigger: "/cluster show:challenge",
      title: "A live challenge",
      body: "Stats are snapshotted the moment someone joins, so only new activity counts. Trophies are real.",
      card: `/api/card/challenge?id=${q(challengeId)}`,
      buttons: [
        { label: "Join challenge", emoji: "🏆", style: "success" },
        { label: "Standings", emoji: "📊", style: "secondary", to: game ? "leaderboard" : "planets" },
        { label: "Full details", emoji: "🔗", style: "link" },
        { label: "Back", emoji: "◀", style: "secondary", to: game ? "planet" : "planets" },
      ],
    });
  }

  steps.push({
    id: "link",
    trigger: "Connect a game",
    title: "Link a game account",
    body: "One tap opens a form inside Discord. Enter your in-game name — that's the whole setup.",
    card: "/api/card/planets",
    buttons: [
      ...(game ? [{ label: game, emoji: "🎮", style: "primary" as const, to: slug ? "profile" : "start" }] : []),
      { label: "Link on the site instead", emoji: "🌐", style: "link" as const },
      { label: "Back", emoji: "◀", style: "secondary" as const, to: "start" },
    ],
  });

  if (slug) {
    steps.push({
      id: "profile",
      trigger: "/cluster",
      title: "Your card",
      body: "Ranks, Cluster Points and every game you play, on one card your members can share anywhere.",
      card: `/api/card/profile?slug=${q(slug)}`,
      buttons: [
        ...(game ? [{ label: game, emoji: "🎮", style: "primary" as const, to: "gamestats" }] : []),
        { label: "Share my profile", emoji: "📣", style: "success" as const },
        { label: "Cluster Points", emoji: "⚡", style: "secondary" as const, to: "cp" },
        { label: "More", emoji: "🧭", style: "secondary" as const },
      ],
    });

    steps.push({
      id: "cp",
      trigger: "/cluster show cp",
      title: "Cluster Points",
      body: "Every game feeds one total. Quests turn playing into progress that carries across games.",
      card: `/api/card/cp?slug=${q(slug)}`,
      buttons: [
        { label: "My quests", emoji: "🗺", style: "primary" },
        { label: "My profile", emoji: "👤", style: "secondary", to: "profile" },
        { label: "Back", emoji: "◀", style: "secondary", to: "profile" },
      ],
    });

    if (game) {
      steps.push({
        id: "gamestats",
        trigger: `/cluster show ${game}`,
        title: `${game} — live stats`,
        body: "Rank, champions and recent matches, straight from the game's own API.",
        card: `/api/card/game-stats?slug=${q(slug)}&game=${q(game)}`,
        buttons: [
          { label: `${game} planet`, emoji: "🪐", style: "primary", to: "planet" },
          { label: "Leaderboard", emoji: "📊", style: "secondary", to: "leaderboard" },
          { label: "My profile", emoji: "👤", style: "secondary", to: "profile" },
          { label: "Back", emoji: "◀", style: "secondary", to: "profile" },
        ],
      });
    }
  }

  // Any button pointing at a step we dropped would be a dead control in a demo
  // whose whole claim is that the controls work.
  const ids = new Set(steps.map((s) => s.id));
  return steps.map((s) => ({
    ...s,
    buttons: s.buttons.map((b) => (b.to && !ids.has(b.to) ? { ...b, to: undefined } : b)),
  }));
}
