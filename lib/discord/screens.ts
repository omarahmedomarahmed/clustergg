import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ButtonStyle, ComponentType, InteractionResponseType } from "@/lib/discord/types";
import { frame, navButton, backButton, rows, linkButton, actionId, button, type Frame, type Button } from "@/lib/discord/components";
import { cardRef, embedColor } from "@/lib/discord/cards";
import { gamerForDiscordId, signInUrl, type LinkedGamer } from "@/lib/discord/identity";
import { siteUrl } from "@/lib/discord/config";
import { catalog } from "@/lib/discord/catalog";
import { liveChallenges, challengeUrl } from "@/lib/challenges";

// Every screen is "a PNG card + buttons underneath it".
//
// Discord embeds cannot put buttons ON an image and cannot composite an avatar
// into artwork, so the glorified visual is a server-rendered PNG shown as the
// embed image, and navigation lives in the button rows below it. Pressing a
// button EDITS THIS MESSAGE rather than posting a new one, which is why the
// whole thing feels like an app instead of a chat log.

export type ScreenPayload = {
  content?: string;
  embeds?: unknown[];
  components?: unknown[];
  flags?: number;
};

export type ScreenCtx = {
  discordId: string;
  discordName: string;
  guildId?: string;
  gamer: LinkedGamer | null;
};

export async function loadCtx(discordId: string, discordName: string, guildId?: string): Promise<ScreenCtx> {
  return { discordId, discordName, guildId, gamer: await gamerForDiscordId(discordId) };
}

function embed(url: string, opts: { title?: string; description?: string; color?: string | null; footer?: string } = {}) {
  return {
    ...(opts.title ? { title: opts.title.slice(0, 250) } : {}),
    ...(opts.description ? { description: opts.description.slice(0, 3800) } : {}),
    color: embedColor(opts.color),
    image: { url },
    ...(opts.footer ? { footer: { text: opts.footer.slice(0, 2000) } } : {}),
  };
}

// The one button that should exist on nearly every screen: it drives people
// back to the site, which is where profiles are customised and votes are cast.
function customizeButton(): Button {
  return linkButton("Customize profile", `${siteUrl()}/profile`, "✨");
}

function signInPrompt(ctx: ScreenCtx, trail: Frame[]): ScreenPayload {
  return {
    embeds: [{
      title: "One step first",
      description:
        "Sign in with Discord once and this bot knows you everywhere.\n\n" +
        "Your Cluster profile carries every game you play, your Cluster Points, your quests and your trophies — one identity instead of a dozen scattered accounts.",
      color: embedColor("#8b5cf6"),
    }],
    components: rows([
      linkButton("Sign in with Discord", signInUrl(siteUrl(), "/feed"), "🚀"),
      backButton(trail),
    ]),
  };
}

// ===== Screens =====

async function homeScreen(ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  if (!ctx.gamer) return welcomeScreen(ctx, trail);
  const { url, data } = await cardRef("profile", { slug: ctx.gamer.slug });
  const accent = data && "theme" in data ? data.theme.accent : null;
  const here = frame("home");
  return {
    embeds: [embed(url, {
      title: `${ctx.gamer.displayName} on Cluster`,
      color: accent,
      footer: "Everything below edits this message — no channel spam.",
    })],
    components: rows([
      navButton("Cluster Points", frame("show", "cp"), [here], ButtonStyle.Primary, "⚡"),
      navButton("Quests", frame("quests"), [here], ButtonStyle.Secondary, "🗺"),
      navButton("Planets", frame("planets"), [here], ButtonStyle.Secondary, "🪐"),
      navButton("Challenges", frame("challenges"), [here], ButtonStyle.Secondary, "🏆"),
      customizeButton(),
      button("Share my profile", actionId("share", [], [here]), ButtonStyle.Success, "📣"),
      linkButton("Open my profile", `${siteUrl()}/u/${ctx.gamer.slug}`, "🔗"),
    ]),
  };
}

async function welcomeScreen(ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const { url } = await cardRef("guide", { topic: "getting-started" });
  const here = frame("home");
  return {
    embeds: [embed(url, {
      title: "Welcome to Cluster",
      description: "Every game you play, one identity. Sign in with Discord and your profile is created instantly.",
      color: "#8b5cf6",
    })],
    components: rows([
      linkButton("Sign in with Discord", signInUrl(siteUrl(), "/feed"), "🚀"),
      navButton("How it works", frame("guide", "getting-started"), [here], ButtonStyle.Secondary, "📖"),
      navButton("Planets", frame("planets"), [here], ButtonStyle.Secondary, "🪐"),
      backButton(trail),
    ]),
  };
}

async function showScreen(what: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const target = what || "profile";

  if (target === "profile" || target === "cp") {
    if (!ctx.gamer) return signInPrompt(ctx, trail);
    const kind = target === "cp" ? "cp" : "profile";
    const { url, data } = await cardRef(kind, { slug: ctx.gamer.slug });
    const accent = data && "theme" in data ? data.theme.accent : null;
    return {
      embeds: [embed(url, { title: target === "cp" ? "Your Cluster Points" : `${ctx.gamer.displayName} on Cluster`, color: accent })],
      components: rows([
        target === "cp"
          ? navButton("My profile", frame("show", "profile"), trail, ButtonStyle.Primary, "👤")
          : navButton("My Cluster Points", frame("show", "cp"), trail, ButtonStyle.Primary, "⚡"),
        navButton("Quests", frame("quests"), trail, ButtonStyle.Secondary, "🗺"),
        customizeButton(),
        backButton(trail),
      ]),
    };
  }

  if (target.startsWith("game:")) {
    if (!ctx.gamer) return signInPrompt(ctx, trail);
    const game = target.slice(5);
    const { url, data } = await cardRef("game-stats", { slug: ctx.gamer.slug, game });
    const linked = !!data;
    return {
      embeds: [embed(url, {
        title: `${game} — ${ctx.gamer.displayName}`,
        description: linked ? undefined : `You haven't linked a ${game} account yet.`,
        color: data && "theme" in data ? data.theme.accent : null,
      })],
      components: rows([
        navButton(`${game} planet`, frame("planet", game), trail, ButtonStyle.Primary, "🪐"),
        navButton("Leaderboard", frame("leaderboard", game), trail, ButtonStyle.Secondary, "📊"),
        linked ? null : linkButton(`Link ${game}`.slice(0, 80), `${siteUrl()}/profile?tab=accounts`, "🔗"),
        backButton(trail),
      ]),
    };
  }

  if (target.startsWith("quest:")) return questScreen(target.slice(6), ctx, trail);

  // A bare game or quest name typed by hand rather than picked from autocomplete.
  const c = await catalog();
  const g = c.games.find((x) => x.value.toLowerCase() === target.toLowerCase());
  if (g) return showScreen(`game:${g.value}`, ctx, trail);
  const q = c.quests.find((x) => x.value.toLowerCase() === target.toLowerCase() || x.name.toLowerCase() === target.toLowerCase());
  if (q) return questScreen(q.value, ctx, trail);

  return showScreen("profile", ctx, trail);
}

async function questScreen(key: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const c = await catalog();
  const questKey = key || c.quests[0]?.value || "";
  const { url, data } = await cardRef("quest", { slug: ctx.gamer?.slug ?? "", quest: questKey });
  const others = c.quests.filter((q) => q.value !== questKey).slice(0, 3);
  return {
    embeds: [embed(url, {
      title: c.quests.find((q) => q.value === questKey)?.name ?? "Quest",
      color: data && "theme" in data ? data.theme.accent : null,
      footer: ctx.gamer ? undefined : "Sign in to track your own progress.",
    })],
    components: rows([
      navButton("How to win", frame("guide", `quest:${questKey}`), trail, ButtonStyle.Primary, "📖"),
      ...others.map((q) => navButton(q.name, frame("show", `quest:${q.value}`), trail)),
      linkButton("Play the quest map", `${siteUrl()}/quests/${questKey}`, "🎮"),
      backButton(trail),
    ]),
  };
}

async function questsScreen(ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  if (ctx.gamer) {
    const { url, data } = await cardRef("cp", { slug: ctx.gamer.slug });
    const c = await catalog();
    return {
      embeds: [embed(url, { title: "Your quests", color: data && "theme" in data ? data.theme.accent : null })],
      components: rows([
        ...c.quests.slice(0, 4).map((q) => navButton(q.name, frame("show", `quest:${q.value}`), trail, ButtonStyle.Secondary)),
        backButton(trail),
      ]),
    };
  }
  const c = await catalog();
  const first = c.quests[0]?.value ?? "";
  return questScreen(first, ctx, trail);
}

async function guideScreen(topic: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const t = topic || "getting-started";
  const { url, data } = await cardRef("guide", { topic: t });
  const c = await catalog();
  const others = c.guides.filter((g) => g.value !== t).slice(0, 3);
  return {
    embeds: [embed(url, {
      title: c.guides.find((g) => g.value === t)?.name ?? "How it works",
      color: data && "theme" in data ? data.theme.accent : null,
    })],
    components: rows([
      ...others.map((g) => navButton(g.name.slice(0, 40), frame("guide", g.value), trail)),
      customizeButton(),
      backButton(trail),
    ]),
  };
}

async function helpScreen(ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const here = frame("home");
  return {
    embeds: [{
      title: "Cluster — every game, one identity",
      description: [
        "Link your game accounts once. Your stats sync from the official APIs, you earn Cluster Points across four quests, and you compete in challenges with real trophies.",
        "",
        "**Type `/cluster` and Discord lists everything.** The main ones:",
        "`/cluster home` — your hub",
        "`/cluster show` — profile, CP, a game or a quest",
        "`/cluster planet game:` — a game's challenges, leaderboard and top gamers",
        "`/cluster challenge` — what's live right now",
        "`/cluster link game:` — link an account",
        "`/cluster share` — post your profile so people can vote for it",
        "`/cluster server` — server owners: your growth toward ad revenue",
      ].join("\n"),
      color: embedColor("#8b5cf6"),
    }],
    components: rows([
      navButton("My hub", frame("home"), [], ButtonStyle.Primary, "🏠"),
      navButton("Getting started", frame("guide", "getting-started"), [here], ButtonStyle.Secondary, "📖"),
      linkButton("Open Cluster", siteUrl(), "🔗"),
      backButton(trail),
    ]),
  };
}

// ===== Planets =====

async function planetsScreen(ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const c = await catalog();
  if (!c.games.length) return notYet("No planets are live yet.", trail);
  return {
    embeds: [{
      title: "Pick a planet",
      description: "Every game is a world: its own challenges, leaderboard and top gamers.",
      color: embedColor("#8b5cf6"),
    }],
    // 24 games won't fit in 25 buttons alongside Back, so the first 20 get
    // buttons and `/cluster planet game:` autocompletes the rest.
    components: rows([
      ...c.games.slice(0, 20).map((g) => navButton(g.name.slice(0, 24), frame("planet", g.value), trail)),
      backButton(trail),
    ]),
  };
}

async function planetScreen(game: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  if (!game) return planetsScreen(ctx, trail);
  const { url, data } = await cardRef("planet", { game });
  if (!data) return notYet(`No planet for **${game}** yet.`, trail);
  return {
    embeds: [embed(url, { title: `${game} Planet`, color: "theme" in data ? data.theme.accent : null })],
    components: rows([
      navButton("Challenges", frame("challenges", game), trail, ButtonStyle.Primary, "🏆"),
      navButton("Leaderboard", frame("leaderboard", game), trail, ButtonStyle.Secondary, "📊"),
      ctx.gamer
        ? navButton("My stats", frame("show", `game:${game}`), trail, ButtonStyle.Secondary, "📈")
        : null,
      navButton("All planets", frame("planets"), trail, ButtonStyle.Secondary, "🪐"),
      backButton(trail),
    ]),
  };
}

// ===== Leaderboard =====

async function leaderboardScreen(game: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  if (!game) {
    const c = await catalog();
    game = c.games[0]?.value ?? "";
  }
  const { url, data } = await cardRef("leaderboard", { game });
  if (!data) return notYet(`No leaderboard for **${game}** yet.`, trail);
  return {
    embeds: [embed(url, {
      title: data.kind === "leaderboard" ? data.title : `${game} leaderboard`,
      color: data.theme.accent,
      footer: "Standings update every time stats sync from the game API.",
    })],
    components: rows([
      navButton(`${game} planet`.slice(0, 24), frame("planet", game), trail, ButtonStyle.Primary, "🪐"),
      navButton("Challenges", frame("challenges", game), trail, ButtonStyle.Secondary, "🏆"),
      linkButton("Full board", `${siteUrl()}/leaderboards`, "🔗"),
      backButton(trail),
    ]),
  };
}

// ===== Challenges =====

async function challengesScreen(game: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const live = await liveChallenges(game || null, 5);
  if (!live.length) {
    return notYet(game ? `No live challenges on **${game}** right now.` : "No challenges are live right now.", trail, [
      navButton("Browse planets", frame("planets"), trail, ButtonStyle.Secondary, "🪐"),
    ]);
  }
  if (live.length === 1) return challengeScreen(live[0].id, ctx, trail);

  const lines = live.map((ch) => {
    const days = Math.max(0, Math.ceil((ch.endAt.getTime() - Date.now()) / 86400000));
    return `**${ch.title}** — ${ch.game} · ${days}d left`;
  });
  return {
    embeds: [{
      title: game ? `Live on ${game}` : "Live challenges",
      description: `${lines.join("\n")}\n\nYour stats are snapshotted when you join — only NEW activity counts.`,
      color: embedColor("#8b5cf6"),
    }],
    components: rows([
      ...live.map((ch) => navButton(ch.title.slice(0, 32), frame("challenge", ch.id), trail, ButtonStyle.Secondary)),
      backButton(trail),
    ]),
  };
}

async function challengeScreen(id: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const { url, data } = await cardRef("challenge", { id });
  if (!data || data.kind !== "challenge") return notYet("That challenge is no longer live.", trail);

  const [joined, webUrl] = await Promise.all([
    ctx.gamer ? hasJoined(ctx.gamer.userId, id) : Promise.resolve(false),
    challengeUrl(siteUrl(), id),
  ]);
  return {
    embeds: [embed(url, {
      title: data.title,
      color: data.theme.accent,
      footer: joined ? "You're in — your standing updates on every sync." : undefined,
    })],
    components: rows([
      !ctx.gamer
        ? linkButton("Sign in to join", signInUrl(siteUrl(), new URL(webUrl).pathname), "🚀")
        : joined
          ? button("You've joined", actionId("noop", [], trail), ButtonStyle.Secondary, "✅")
          : button("Join challenge", actionId("join", [id], trail), ButtonStyle.Success, "🏆"),
      navButton(`${data.game} planet`.slice(0, 24), frame("planet", data.game), trail, ButtonStyle.Secondary, "🪐"),
      linkButton("Full details", webUrl, "🔗"),
      backButton(trail),
    ]),
  };
}

async function hasJoined(userId: string, challengeId: string): Promise<boolean> {
  try {
    const db = await getDb();
    const [row] = await db.select({ id: schema.challengeParticipants.id })
      .from(schema.challengeParticipants)
      .where(and(
        eq(schema.challengeParticipants.userId, userId),
        eq(schema.challengeParticipants.challengeId, challengeId),
      )).limit(1);
    return !!row;
  } catch { return false; }
}

// ===== Link a game account =====

// Discord modals are the one place a true modal is correct: a short form with
// text inputs. Everything else in this bot is an embed + buttons.
export function linkModal(game: string, provider: string) {
  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: `link|${provider}|${game}`.slice(0, 100),
      title: `Link your ${game} account`.slice(0, 45),
      components: [
        {
          type: ComponentType.ActionRow,
          components: [{
            type: ComponentType.TextInput, custom_id: "ign", style: 1, required: true,
            label: "In-game name", max_length: 64,
            placeholder: "Exactly as it appears in game",
          }],
        },
        {
          type: ComponentType.ActionRow,
          components: [{
            type: ComponentType.TextInput, custom_id: "region", style: 1, required: false,
            label: "Region / server (if the game has one)", max_length: 24,
            placeholder: "e.g. EUW, NA, ASIA",
          }],
        },
      ],
    },
  };
}

async function linkScreen(game: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  if (!ctx.gamer) return signInPrompt(ctx, trail);
  const c = await catalog();
  if (!game) {
    return {
      embeds: [{
        title: "Link a game account",
        description: "Pick a game, then enter your in-game name. Stats sync from the official API — never self-reported.",
        color: embedColor("#8b5cf6"),
      }],
      components: rows([
        ...c.games.slice(0, 20).map((g) => navButton(g.name.slice(0, 24), frame("link", g.value), trail)),
        backButton(trail),
      ]),
    };
  }
  // The modal has to open from a fresh interaction, so this screen hands over a
  // button that triggers it rather than trying to open one from a deferred edit.
  return {
    embeds: [{
      title: `Link ${game}`,
      description: "Tap below and enter your in-game name. That's the whole setup — your rank, wins and more sync automatically from then on.",
      color: embedColor("#8b5cf6"),
    }],
    components: rows([
      button(`Link my ${game} account`.slice(0, 40), `open-link|${game}`, ButtonStyle.Primary, "🔗"),
      linkButton("Link on the site instead", `${siteUrl()}/profile?tab=accounts`, "🌐"),
      backButton(trail),
    ]),
  };
}

// An honest empty state — never a raw error, never a dead end.
function notYet(message: string, trail: Frame[], extra: (Button | null)[] = []): ScreenPayload {
  return {
    embeds: [{ description: message, color: embedColor("#8b5cf6") }],
    components: rows([...extra, linkButton("Open Cluster", siteUrl(), "🔗"), backButton(trail)]),
  };
}

// Screens that arrive with the growth + admin phases.
async function comingSoon(name: string, trail: Frame[]): Promise<ScreenPayload> {
  return {
    embeds: [{
      title: "Coming with the next release",
      description: `**${name}** isn't wired up yet. Everything on the site works today.`,
      color: embedColor("#8b5cf6"),
    }],
    components: rows([linkButton("Open Cluster", siteUrl(), "🔗"), backButton(trail)]),
    flags: 64,
  };
}

// ===== Dispatch =====

export async function renderScreen(f: Frame, trail: Frame[], ctx: ScreenCtx): Promise<ScreenPayload> {
  const [a = ""] = f.args;
  switch (f.screen) {
    case "home": return homeScreen(ctx, trail);
    case "help": return helpScreen(ctx, trail);
    case "show": return showScreen(a, ctx, trail);
    case "quest": return questScreen(a, ctx, trail);
    case "quests": return questsScreen(ctx, trail);
    case "guide": return guideScreen(a, ctx, trail);
    case "planet": return planetScreen(a, ctx, trail);
    case "planets": return planetsScreen(ctx, trail);
    case "leaderboard": return leaderboardScreen(a, ctx, trail);
    case "challenge": return challengeScreen(a, ctx, trail);
    case "challenges": return challengesScreen(a, ctx, trail);
    case "link": return linkScreen(a, ctx, trail);
    case "server": return comingSoon("Server growth", trail);
    case "admin": return comingSoon("Server settings", trail);
    default: return homeScreen(ctx, trail);
  }
}

// The screen a `/cluster <sub>` invocation lands on.
export function screenForCommand(sub: string, opts: Record<string, string>): Frame {
  switch (sub) {
    case "show": return frame("show", opts.what ?? "profile");
    case "planet": return frame("planet", opts.game ?? "");
    case "leaderboard": return frame("leaderboard", opts.game ?? "");
    case "challenge": return frame("challenges", opts.game ?? "");
    case "quest": return frame("quest", opts.name ?? "");
    case "link": return frame("link", opts.game ?? "");
    case "guide": return frame("guide", opts.topic ?? "getting-started");
    case "share": return frame("show", "profile");
    case "server": return frame("server");
    case "admin": return frame("admin");
    case "help": return frame("help");
    default: return frame("home");
  }
}
