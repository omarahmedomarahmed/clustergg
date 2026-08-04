import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ButtonStyle, ComponentType, InteractionResponseType } from "@/lib/discord/types";
import { frame, navButton, backButton, rows, linkButton, actionId, button, navId, select, selectRow, withButtonCopy, type Frame, type Button } from "@/lib/discord/components";
import { buttonCopy } from "@/lib/discord/button-store";
import { cardRef, currentCardGuild, currentSponsor, embedColor, liveCardUrl, setCardGuild } from "@/lib/discord/cards";
import { withSponsorRow } from "@/lib/discord/sponsor";
import { ensureGamerForDiscord, discordAvatarUrl, signInUrl, type LinkedGamer } from "@/lib/discord/identity";
import { siteUrl } from "@/lib/discord/config";
import { catalog } from "@/lib/discord/catalog";
import { liveChallenges, challengeUrl, challengeGate, keyVisibleTo, challengesForGuild, entryAccounts } from "@/lib/challenges";
import { listRequests, requestableGames } from "@/lib/challenge-requests";
import { guildStats, attributeMember, getGuildRow } from "@/lib/discord/guilds";
import { ensurePortal } from "@/lib/server-portal";
import { hqInviteUrl } from "@/lib/discord/hq";
import { clusterPctFor, nextEarnTier, ownerPctFor } from "@/lib/server-earnings";
import { REGIONS, VIBES, completeness, getCommunity, regionLabel, vibeLabel } from "@/lib/discord/community";
import { findByInGameName, findByDiscordName, searchGamers } from "@/lib/gamer-lookup";
import { recordProfileView, hasVoted } from "@/lib/identity";
import { getProvider, linkableGames, linkableProvider, PROVIDERS } from "@/lib/providers/registry";

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
  // Does Discord consider this person a manager of the server they're in?
  // Running a challenge is a server-staff action, so it can't be inferred from
  // "is in the guild" — every member is.
  isManager?: boolean;
  /**
   * The invite into our own server, when one is configured.
   *
   * Resolved once per interaction and carried on the context because the
   * button tail is synchronous. Null means no invite is set, and the button is
   * simply absent — a "get help" button that goes nowhere is worse than none.
   */
  hqInvite?: string | null;
};

export async function loadCtx(
  discordId: string,
  discordName: string,
  guildId?: string,
  avatar?: string | null,
  isManager = false,
): Promise<ScreenCtx> {
  // Every card rendered for the rest of this request belongs to this server —
  // which is how a sponsor impression gets attributed to the community that
  // produced it without passing a guild id through every screen.
  setCardGuild(guildId);
  // Using the bot is the sign-up. Sending someone to the website before they
  // can even see their own card is the biggest drop-off in the funnel and buys
  // nothing — the interaction is signed and carries everything the OAuth
  // callback would have given us.
  const gamer = await ensureGamerForDiscord(discordId, discordName, discordAvatarUrl(discordId, avatar));
  // Using the bot inside a server is the moment we know which server a gamer
  // came from — so that's where attribution is recorded. It's insert-if-absent,
  // so the first server they use it in gets the credit.
  if (gamer && guildId) void attributeMember(guildId, gamer.userId).catch(() => {});
  const hqInvite = await hqInviteUrl().catch(() => null);
  return { discordId, discordName, guildId, gamer, isManager, hqInvite };
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

// Every card carries a way back to the beginning. Someone who lands on a guide
// pinned six months ago should be one tap from picking their game — that's the
// whole funnel, and it shouldn't depend on them knowing a command.
function startHereButton(trail: Frame[]): Button {
  return navButton("START HERE", frame("planets"), trail, ButtonStyle.Primary, "🚀");
}

// ===== The standard tail =====
//
// Every card ends the same way, so the bot navigates like one product instead
// of a pile of unrelated screens. Four buttons, in this order:
//
//   Connect a game — the single action that turns a viewer into a gamer, and
//                    the thing every card should be one tap from. It opens the
//                    in-Discord picker, never a link out.
//   My profile     — where you always are relative to everyone else.
//   More           — everything that doesn't fit on this card, so a screen
//                    never needs eight buttons to be complete.
//   Back           — the trail you arrived on.
//
// `rows()` drops duplicates, so a screen adds its own buttons freely and the
// tail quietly contributes only what's missing.

function connectButton(ctx: ScreenCtx, trail: Frame[]): Button {
  // In Discord, always. A "link your account" button that opens a browser is
  // where most people stop, and the modal is right there.
  return ctx.gamer
    ? navButton("Connect a game", frame("link", ""), trail, ButtonStyle.Success, "🎮")
    : linkButton("Continue with Discord", signInUrl(siteUrl(), "/feed"), "🚀");
}

function profileButton(ctx: ScreenCtx, trail: Frame[]): Button | null {
  if (!ctx.gamer) return null;
  // Home IS the profile card — one destination, so there is never a "home" and
  // a "profile" that show different things.
  return navButton("My profile", frame("home"), trail, ButtonStyle.Secondary, "👤");
}

function moreButton(trail: Frame[]): Button {
  return navButton("More", frame("more"), trail, ButtonStyle.Secondary, "🧭");
}

/**
 * Vote for Cluster on the bot lists, and get paid for it.
 *
 * On EVERY card, because bot-list ranking is votes and the lists are how a
 * server that has never heard of us finds us. It is a link button rather than
 * a navigation one — voting happens on the list's own site — and it points at
 * one page rather than one list, because which lists we are live on changes and
 * a button baked with a URL goes stale the moment a listing is approved.
 *
 * The label says what you get. "Vote for Cluster" is a favour being asked;
 * "Vote for Cluster · earn CP" is a trade, and the difference is most of the
 * conversion.
 */
function voteButton(): Button {
  return linkButton("Vote for Cluster · earn CP", `${siteUrl()}/vote`, "⭐");
}

/**
 * The way to reach a person.
 *
 * A bot with no support channel is a bot people uninstall the first time
 * something confuses them — and the thing that confuses them is usually a
 * five-second answer. This lands them in our server, where the answer is
 * somebody typing rather than a form.
 *
 * It doubles as the top of the funnel for the platform itself: the people most
 * likely to join a Cluster community are the ones already using Cluster.
 */
function supportButton(ctx: ScreenCtx): Button | null {
  return ctx.hqInvite ? linkButton("Get help · our server", ctx.hqInvite, "💬") : null;
}

// `here` is the screen being drawn, so the tail never offers a button that
// leads back to the card you're already looking at.
function tail(ctx: ScreenCtx, here: Frame, trail: Frame[]): (Button | null)[] {
  const on = (screen: string) => here.screen === screen;
  return [
    on("link") ? null : connectButton(ctx, trail),
    on("home") ? null : profileButton(ctx, trail),
    on("more") ? null : moreButton(trail),
    backButton(trail),
    // Last in the tail, so they never displace navigation — `rows()` fills five
    // to a row and the tail is what a card can't do without.
    voteButton(),
    supportButton(ctx),
  ];
}

async function signInPrompt(ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const { url } = await cardRef("guide", { topic: "getting-started" });
  return {
    embeds: [embed(url, {
      title: "One step first",
      description:
        "Continue with Discord — one tap, and this bot knows you everywhere.\n\n" +
        "Your Cluster profile carries every game you play, your Cluster Points, your quests and your trophies — one identity instead of a dozen scattered accounts.",
      color: "#8b5cf6",
    })],
    components: rows([
      linkButton("Continue with Discord", signInUrl(siteUrl(), "/feed"), "🚀"),
      ...tail(ctx, frame("signin"), trail),
    ]),
  };
}

// ===== Screens =====

// Home IS your profile card.
//
// There used to be a "hub" here and a separate profile screen, which meant two
// buttons that sounded like the same thing showed different cards. Now Home and
// My profile are one destination: your rendered profile card, with your own
// background art, and a button per game you've linked. Everything that used to
// crowd this screen moved to More.
async function homeScreen(ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  if (!ctx.gamer) return welcomeScreen(ctx, trail);
  const here = frame("home");
  const [{ url, data }, accounts] = await Promise.all([
    cardRef("profile", { slug: ctx.gamer.slug }),
    linkedAccountsOf(ctx.gamer.userId),
  ]);
  const accent = data && "theme" in data ? data.theme.accent : null;
  return {
    embeds: [embed(url, {
      title: `${ctx.gamer.displayName} on Cluster`,
      color: accent,
      // When there are more accounts than buttons, say so. Silent truncation
      // reads as "Cluster lost four of my accounts".
      footer: accounts.length > ACCOUNT_BUTTONS
        ? `Showing ${ACCOUNT_BUTTONS} of your ${accounts.length} accounts — the rest are on your profile. Everything below edits this message — no channel spam.`
        : accounts.length
          ? "Tap an account for its live stats. Everything below edits this message — no channel spam."
          : "Everything below edits this message — no channel spam.",
    })],
    components: rows([
      // Your accounts first — they're the reason to look at your own card.
      //
      // One button EACH, named after the account. Two accounts on the same game
      // are two buttons opening two different stats cards; the account id rides
      // in the frame so they cannot resolve to the same one.
      //
      // Twelve is the ceiling — six games with a main and a smurf on each, which
      // is the realistic worst case. It is not Discord's limit (25) because
      // `rows()` truncates from the END, so accounts allowed to fill the message
      // would push Home, More and Back off it and strand whoever pressed one.
      // Twelve leaves the whole tail room to survive.
      ...accounts.slice(0, ACCOUNT_BUTTONS).map((a) =>
        navButton(accountButtonLabel(a), frame("show", `game:${a.game}`, a.id), [here, ...trail], gameStyle(a.game), "🎮")),
      button("Share my profile", actionId("share", [], [here]), ButtonStyle.Success, "📣"),
      navButton("Cluster Points", frame("show", "cp"), [here, ...trail], ButtonStyle.Primary, "⚡"),
      ...tail(ctx, here, [here, ...trail].slice(1)),
      customizeButton(),
    ]),
  };
}

// Everything a card doesn't have room for.
//
// This exists so no screen has to choose between being complete and being
// readable: the card shows what it's about, and More holds the rest of the
// product. It's reachable from every card, so it's also the recovery path when
// someone lands somewhere unexpected.
async function moreScreen(ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const here = frame("more");
  const t = [here, ...trail];
  const { url } = await cardRef("guide", { topic: "everything" });
  return {
    embeds: [embed(url, {
      title: "Everything Cluster does",
      description: ctx.isManager
        ? "Your server's growth toward ad revenue, and the tools to run your own challenges, are in here too."
        : undefined,
      color: "#8b5cf6",
    })],
    components: rows([
      navButton("Planets", frame("planets"), t, ButtonStyle.Primary, "🪐"),
      navButton("Challenges", frame("challenges"), t, ButtonStyle.Success, "🏆"),
      navButton("Profile of the Week", frame("week"), t, ButtonStyle.Success, "👑"),
      navButton("Trophy marketplace", frame("market"), t, ButtonStyle.Secondary, "🏆"),
      navButton("Quests", frame("quests"), t, ButtonStyle.Secondary, "🗺"),
      navButton("Leaderboards", frame("leaderboard", ""), t, ButtonStyle.Secondary, "📊"),
      navButton("How it works", frame("guide", "getting-started"), t, ButtonStyle.Secondary, "📖"),
      ctx.isManager ? navButton("Server admin", frame("admin", ""), t, ButtonStyle.Secondary, "🛰") : null,
      navButton("Commands", frame("help"), t, ButtonStyle.Secondary, "❓"),
      ...tail(ctx, here, trail),
      linkButton("Open Cluster", siteUrl(), "🔗"),
    ]),
  };
}

/**
 * The trophy marketplace, in Discord.
 *
 * The SHELF is shown here — balance, the closest trophies, what they redeem
 * for — but the purchase itself happens on the website, deliberately. Spending
 * something that converts to real money should happen where the gamer is signed
 * in and can see what they are getting, which is the same reason voting links
 * out rather than resolving in a button.
 */
async function marketScreen(ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const here = frame("market");
  const t = [here, ...trail];
  const site = siteUrl();

  const { marketCard } = await import("@/lib/cards/data");
  const data = await marketCard({ userId: ctx.gamer?.userId ?? null });
  const { url } = await cardRef("market", { gamer: ctx.gamer?.userId ?? "" });
  const six = (data && data.kind === "market" ? data.trophies : []).slice(0, 6);

  // A button per trophy, numbered to match the tile it sits under — the card
  // is a picture, so the only thing tying a button to a trophy is the number
  // printed on both.
  const buys = six.map((x, i) => button(
    `${i + 1} · ${x.cpPrice.toLocaleString()} CP`,
    actionId("buy", [x.id], t),
    x.affordable ? ButtonStyle.Success : ButtonStyle.Secondary,
  ));

  return {
    embeds: [embed(url, {
      title: "Trophy marketplace",
      description: ctx.gamer
        ? undefined
        : "Continue with Discord and your balance is waiting — points are earned free, just by playing.",
      color: "#fbbf24",
    })],
    components: rows([
      ...buys,
      ctx.gamer ? null : linkButton("Continue with Discord", signInUrl(site, "/marketplace"), "🔗"),
      linkButton("Open the marketplace", `${site}/marketplace`, "🏆"),
      ...tail(ctx, here, trail),
    ]),
  };
}

async function welcomeScreen(ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const { url } = await cardRef("guide", { topic: "getting-started" });
  const here = frame("home");
  return {
    embeds: [embed(url, {
      title: "Welcome to Cluster",
      description: "Every game you play, one identity. Continue with Discord and your profile is ready instantly.",
      color: "#8b5cf6",
    })],
    components: rows([
      startHereButton([here]),
      linkButton("Continue with Discord", signInUrl(siteUrl(), "/feed"), "🔗"),
      navButton("How it works", frame("guide", "getting-started"), [here], ButtonStyle.Secondary, "📖"),
      ...tail(ctx, here, trail),
    ]),
  };
}

// The accounts a gamer has actually linked. A profile card can only LIST them;
// these are what turn each one into a button you can press to see the real
// stats behind it.
//
// ONE ROW PER ACCOUNT, not per game. This used to collapse on `p.game` and keep
// the first account it saw, which meant a gamer with two accounts on one game —
// a main and a smurf, or one per region, which is ordinary — got a single button
// that always opened one of them and left the other unreachable. That is exactly
// the case where a gamer most needs to choose.
//
// Each row carries its account id so the button can name the account it opens
// rather than the game it belongs to: "NovaStrike#EUW", not "VALORANT".
async function linkedAccountsOf(userId: string): Promise<{ id: string; game: string; tag: string }[]> {
  try {
    const db = await getDb();
    const accounts = await db.select({
      id: schema.linkedGameAccounts.id,
      provider: schema.linkedGameAccounts.provider,
      inGameName: schema.linkedGameAccounts.inGameName,
    }).from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, userId));
    const out: { id: string; game: string; tag: string }[] = [];
    for (const a of accounts) {
      const p = getProvider(a.provider);
      // `identityOnly` providers (Discord, Epic, Battle.net) carry no stats, so
      // a button for one would open an empty card.
      if (!p || p.identityOnly) continue;
      out.push({ id: a.id, game: p.game, tag: a.inGameName });
    }
    return out;
  } catch { return []; }
}

/**
 * The label for one account's button.
 *
 * The account's own name is what a gamer recognises — they have two VALORANT
 * accounts and only one of them is theirs-for-ranked. The game name is appended
 * only when it fits, because with six games linked the tag alone stops saying
 * which game it belongs to.
 *
 * Discord caps a button label at 80 characters, but a button that long wrecks
 * the row layout long before Discord objects, so this stays inside 24.
 */
/**
 * How many account buttons one card carries.
 *
 * Six games with a main and a smurf on each — the realistic worst case, and the
 * number B25 sizes for. Deliberately well under Discord's 25: `rows()`
 * truncates from the end, so accounts allowed to fill the message would push
 * Home, More and Back off it.
 */
const ACCOUNT_BUTTONS = 12;

function accountButtonLabel(a: { game: string; tag: string }): string {
  const tag = a.tag?.trim() || a.game;
  return tag.length <= 24 ? tag : `${tag.slice(0, 23)}…`;
}

// Someone else's snapshot — the whole point of `/cluster show <game> <tag>`.
// Works for ANY gamer on the platform, from any server: that's what makes the
// bot worth having in a server where nobody has signed up yet.
async function otherGamerScreen(what: string, gamer: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const isDiscordLookup = /^discord$/i.test(what);
  const game = what.startsWith("game:") ? what.slice(5) : what;

  // `/cluster <a name>` is now the main way anyone looks somebody up, and a
  // person typing a name knows the name — not whether it's that gamer's Discord
  // handle, their Cluster display name or the tag they use in one game. So an
  // exact handle match is tried first and a broad search catches everything
  // else, rather than answering "no such Discord handle" to a real player's
  // real in-game name.
  const found = isDiscordLookup
    ? (await findByDiscordName(gamer)) ?? (await searchGamers(gamer, 1))[0] ?? null
    : (await findByInGameName(game, gamer)) ?? (await findByDiscordName(gamer)) ?? (await searchGamers(gamer, 1))[0] ?? null;

  if (!found) {
    return notYet(
      isDiscordLookup
        ? `No Cluster gamer with the Discord handle **${gamer}**.`
        : `No one on Cluster has linked **${gamer}** on **${game}** yet.`,
      trail,
      [linkableProvider(game)
        ? button("Connect yours", `open-link|${game}`, ButtonStyle.Success, "🎮")
        : navButton("Connect a game", frame("link", ""), trail, ButtonStyle.Success, "🎮")],
      ctx,
    );
  }

  // Being shown in a server IS a profile view — it's how the person gets seen,
  // and a gamer should get credit for it.
  void recordProfileView(found.userId, {
    source: "discord", guildId: ctx.guildId ?? null,
    viewerDiscordId: ctx.discordId,
  }).catch(() => {});

  // A specific game was asked for → the account snapshot. Otherwise the whole
  // profile, which is what a Discord-handle lookup means.
  const wantsGame = !isDiscordLookup && !!found.game;
  const kind = wantsGame ? "game-stats" : "profile";
  const args: Record<string, string> = wantsGame
    ? { slug: found.slug, game: found.game! }
    : { slug: found.slug };
  const { url, data } = await cardRef(kind, args);

  const [voted, accounts] = await Promise.all([
    hasVoted(found.userId, ctx.gamer?.userId ?? null, ctx.discordId),
    linkedAccountsOf(found.userId),
  ]);
  const here = frame("gamer", what, gamer);

  // One button per game they've linked. A profile card can only LIST the games;
  // seeing someone's actual rank, champions and recent matches is the reason
  // you looked them up, and it shouldn't need a second command.
  const gameButtons = accounts
    .filter((a) => !wantsGame || a.game.toLowerCase() !== (found.game ?? "").toLowerCase())
    .slice(0, 8)
    .map((a) => navButton(accountButtonLabel(a), frame("gamer", `game:${a.game}`, a.tag), [here, ...trail], gameStyle(a.game), "🎮"));

  return {
    embeds: [embed(url, {
      title: wantsGame ? `${found.inGameName ?? gamer} · ${found.game}` : found.displayName,
      description: wantsGame ? `${found.displayName} on Cluster` : undefined,
      color: data && "theme" in data ? data.theme.accent : null,
      footer: accounts.length && !wantsGame ? "Tap an account to see their real stats." : undefined,
    })],
    components: rows([
      ...gameButtons,
      wantsGame
        ? navButton("Full profile", frame("gamer", "discord", found.slug), trail, ButtonStyle.Primary, "👤")
        : null,
      voted
        ? button("Voted", actionId("noop", [], [here, ...trail]), ButtonStyle.Secondary, "✅")
        : button("Vote for this profile", actionId("vote", [found.slug], [here, ...trail]), ButtonStyle.Success, "⭐"),
      ...tail(ctx, here, trail),
      linkButton("Open profile", `${siteUrl()}/u/${found.slug}`, "🔗"),
    ]),
  };
}

/**
 * `accountArg` is the linked-account id, present only when the button that led
 * here was a per-account button (`show ~ game:VALORANT ~ <accountId>`). It is
 * what lets two accounts on one game open two different cards; a typed
 * `/cluster show <game>` has none and gets the gamer's first account, unchanged.
 */
async function showScreen(what: string, ctx: ScreenCtx, trail: Frame[], accountArg = ""): Promise<ScreenPayload> {
  const target = what || "profile";

  // `show profile` and Home are the same destination, on purpose — one profile
  // card, whichever button you pressed to reach it.
  if (target === "profile") return homeScreen(ctx, trail);

  if (target === "cp") {
    if (!ctx.gamer) return signInPrompt(ctx, trail);
    const { url, data } = await cardRef("cp", { slug: ctx.gamer.slug });
    const here = frame("show", "cp");
    return {
      embeds: [embed(url, {
        title: "Your Cluster Points",
        color: data && "theme" in data ? data.theme.accent : null,
        footer: "Cluster Points come from quests — every game you play feeds the same total.",
      })],
      components: rows([
        navButton("My quests", frame("quests"), [here, ...trail], ButtonStyle.Primary, "🗺"),
        linkButton("CP history", `${siteUrl()}/quests`, "📜"),
        ...tail(ctx, here, trail),
      ]),
    };
  }

  if (target.startsWith("game:")) {
    if (!ctx.gamer) return signInPrompt(ctx, trail);
    const game = target.slice(5);
    // The account id, when the button came from a per-account button. Without
    // one this is the gamer's first account on that game, which is what a typed
    // `/cluster show <game>` means.
    const { url, data } = await cardRef("game-stats", { slug: ctx.gamer.slug, game, ...(accountArg ? { account: accountArg } : {}) });
    const linked = !!data;
    return {
      embeds: [embed(url, {
        // The account's own name in the title, because with two accounts on
        // one game "VALORANT — Nova" is the same heading twice.
        title: (data && "tag" in data && data.tag ? `${data.tag} · ${game}` : `${game} — ${ctx.gamer.displayName}`).slice(0, 250),
        description: linked ? undefined : `You haven't linked a ${game} account yet.`,
        color: data && "theme" in data ? data.theme.accent : null,
      })],
      components: rows([
        navButton(`${game} planet`, frame("planet", game), trail, ButtonStyle.Primary, "🪐"),
        navButton("Leaderboard", frame("leaderboard", game), trail, ButtonStyle.Secondary, "📊"),
        navButton("Challenges", frame("challenges", game), trail, ButtonStyle.Secondary, "🏆"),
        // Not linked? Then the one useful button is the one that fixes that,
        // and it opens the modal for THIS game rather than a generic picker.
        linked || !linkableProvider(game)
          ? null
          : button(`Link my ${game} account`.slice(0, 40), `open-link|${game}`, ButtonStyle.Success, "🔗"),
        // The account id rides in this frame too, so Back returns to THIS
        // account's card rather than to whichever one happens to be first.
        ...tail(ctx, frame("show", target, accountArg), trail),
      ]),
    };
  }

  if (target.startsWith("quest:")) return questScreen(target.slice(6), ctx, trail);

  // A bare game or quest name typed by hand rather than picked from autocomplete.
  const c = await catalog();
  const g = c.games.find((x) => x.value.toLowerCase() === target.toLowerCase());
  if (g) return showScreen(`game:${g.value}`, ctx, trail, accountArg);
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
      footer: ctx.gamer ? undefined : "Continue with Discord to track your own progress.",
    })],
    components: rows([
      navButton("How to win", frame("guide", `quest:${questKey}`), trail, ButtonStyle.Primary, "📖"),
      ...others.map((q) => navButton(q.name, frame("show", `quest:${q.value}`), trail)),
      ...tail(ctx, frame("quest", questKey), trail),
      linkButton("Play the quest map", `${siteUrl()}/quests/${questKey}`, "🎮"),
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
        ...tail(ctx, frame("quests"), trail),
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
      startHereButton(trail),
      ...others.map((g) => navButton(g.name.slice(0, 40), frame("guide", g.value), trail)),
      ...tail(ctx, frame("guide", t), trail),
      customizeButton(),
    ]),
  };
}

async function helpScreen(ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const here = frame("home");
  const { url } = await cardRef("guide", { topic: "commands" });
  return {
    embeds: [embed(url, {
      title: "Cluster — every game, one identity",
      description: [
        "**`/cluster`** — your own card.",
        "**`/cluster <anything>`** — a game, a quest, a guide, or another gamer's name. Start typing and the suggestions fill in from live data.",
        ctx.isManager ? "**`/cluster show:admin`** — run a challenge for this server, and see your growth toward ad revenue." : null,
        "**`/cluster show:week`** — Profile of the Week: where the vote stands and how long is left.",
        "**`/cluster show:share`** — post your card publicly so people can vote for it.",
      ].filter(Boolean).join("\n"),
      color: "#8b5cf6",
    })],
    components: rows([
      startHereButton([here]),
      navButton("Profile of the Week", frame("week"), [here], ButtonStyle.Success, "👑"),
      navButton("Getting started", frame("guide", "getting-started"), [here], ButtonStyle.Secondary, "📖"),
      ...tail(ctx, frame("help"), trail),
      linkButton("Open Cluster", siteUrl(), "🔗"),
    ]),
  };
}

// ===== Planets =====

// Discord button styles are a fixed palette of four, so "a different colour per
// game" means spreading games across them deterministically — the same game is
// always the same colour, everywhere in the bot.
// Danger is deliberately NOT in here. In Discord red means destructive, so a
// grid of game buttons with "League of Legends" and "PUBG" in red read as
// warnings rather than as games — the picker looked broken.
const BUTTON_PALETTE = [ButtonStyle.Primary, ButtonStyle.Success, ButtonStyle.Secondary];
function gameStyle(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return BUTTON_PALETTE[h % BUTTON_PALETTE.length];
}

// The screen every "START HERE" button lands on: every game, as its own
// coloured button, over the games-galaxy art.
async function planetsScreen(ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const c = await catalog();
  if (!c.games.length) return notYet("No planets are live yet.", trail, [], ctx);
  const { url } = await cardRef("planets", {});
  return {
    embeds: [embed(url, {
      title: "Pick your game",
      description: "Every game is a world: its own challenges, leaderboard and top gamers. Tap one to land there.",
      color: "#8b5cf6",
    })],
    // 24 games won't fit in 25 buttons alongside Back, so the first 20 get
    // buttons and `/cluster show:planet game:` autocompletes the rest.
    // 20 games plus the tail is the whole 25-button budget, so the games get
    // the room and `/cluster show:planet game:` autocompletes the rest.
    components: rows([
      ...c.games.slice(0, 20).map((g) => navButton(g.name.slice(0, 24), frame("planet", g.value), trail, gameStyle(g.value))),
      ...tail(ctx, frame("planets"), trail),
    ]),
  };
}

async function planetScreen(game: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  if (!game) return planetsScreen(ctx, trail);
  const { url, data } = await cardRef("planet", { game });
  if (!data) return notYet(`No planet for **${game}** yet.`, trail, [], ctx);
  return {
    embeds: [embed(url, { title: `${game} Planet`, color: "theme" in data ? data.theme.accent : null })],
    components: rows([
      navButton("Challenges", frame("challenges", game), trail, ButtonStyle.Primary, "🏆"),
      navButton("Leaderboard", frame("leaderboard", game), trail, ButtonStyle.Secondary, "📊"),
      ctx.gamer
        ? navButton("My stats", frame("show", `game:${game}`), trail, ButtonStyle.Secondary, "📈")
        : null,
      navButton("All planets", frame("planets"), trail, ButtonStyle.Secondary, "🪐"),
      ...tail(ctx, frame("planet", game), trail),
    ]),
  };
}

// ===== Leaderboard =====

// Every board a game runs, not one.
//
// A game usually has several — rank, wins, KD, playtime — and showing only the
// first quietly hid the rest, so a gamer who is #1 on the board that matters to
// them never saw it. This lists them all and gives each one a button.
async function boardsFor(game: string): Promise<{ metricKey: string; title: string }[]> {
  try {
    const db = await getDb();
    return await db.select({ metricKey: schema.leaderboards.metricKey, title: schema.leaderboards.title })
      .from(schema.leaderboards)
      .where(and(eq(schema.leaderboards.game, game), eq(schema.leaderboards.isActive, true)))
      .limit(8);
  } catch { return []; }
}

async function leaderboardScreen(game: string, metric: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  if (!game) {
    // No game given: offer the picker rather than silently choosing one, so
    // "Leaderboards" from More doesn't look like it only knows one game.
    const c = await catalog();
    if (c.games.length > 1) {
      const here = frame("leaderboard", "");
      const { url } = await cardRef("planets", {});
      return {
        embeds: [embed(url, {
          title: "Leaderboards",
          description: "Every game we sync runs its own boards — rank, wins, and whatever else that game measures. Pick a game.",
          color: "#8b5cf6",
        })],
        components: rows([
          ...c.games.slice(0, 18).map((g) => navButton(g.name.slice(0, 24), frame("leaderboard", g.value), [here, ...trail], gameStyle(g.value), "📊")),
          ...tail(ctx, here, trail),
        ]),
      };
    }
    game = c.games[0]?.value ?? "";
  }

  const [{ url, data }, boards] = await Promise.all([
    cardRef("leaderboard", metric ? { game, metric } : { game }),
    boardsFor(game),
  ]);
  if (!data) return notYet(`No leaderboard for **${game}** yet.`, trail, [], ctx);

  const here = frame("leaderboard", game, metric);
  const shown = data.kind === "leaderboard" ? data.title : "";
  // One button per OTHER board on this game — the current one is already the
  // card you're looking at.
  const boardButtons = boards
    .filter((b) => b.title !== shown)
    .slice(0, 4)
    .map((b) => navButton(b.title.slice(0, 24), frame("leaderboard", game, b.metricKey), [here, ...trail], ButtonStyle.Secondary, "📊"));

  return {
    embeds: [embed(url, {
      title: shown || `${game} leaderboard`,
      description: boards.length > 1 ? `${boards.length} boards on ${game} — tap another below.` : undefined,
      color: data.theme.accent,
      footer: "Standings update every time stats sync from the game API.",
    })],
    components: rows([
      ...boardButtons,
      navButton(`${game} planet`.slice(0, 24), frame("planet", game), trail, ButtonStyle.Primary, "🪐"),
      navButton("Challenges", frame("challenges", game), trail, ButtonStyle.Secondary, "🏆"),
      ...tail(ctx, here, trail),
      linkButton("Full board", `${siteUrl()}/leaderboards`, "🔗"),
    ]),
  };
}

// ===== Challenges =====

async function challengesScreen(game: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const live = await liveChallenges(game || null, 5);
  if (!live.length) {
    return notYet(game ? `No live challenges on **${game}** right now.` : "No challenges are live right now.", trail, [
      navButton("Browse planets", frame("planets"), trail, ButtonStyle.Secondary, "🪐"),
    ], ctx);
  }
  if (live.length === 1) return challengeScreen(live[0].id, ctx, trail);

  const lines = live.map((ch) => {
    const days = Math.max(0, Math.ceil((ch.endAt.getTime() - Date.now()) / 86400000));
    return `**${ch.title}** — ${ch.game} · ${days}d left`;
  });
  const { url } = await cardRef("challenge", { id: live[0].id });
  return {
    embeds: [embed(url, {
      title: game ? `Live on ${game}` : "Live challenges",
      description: `${lines.join("\n")}\n\nYour stats are snapshotted when you join — only NEW activity counts.`,
      color: "#8b5cf6",
    })],
    components: rows([
      ...live.map((ch) => navButton(ch.title.slice(0, 32), frame("challenge", ch.id), trail, ButtonStyle.Success, "🏆")),
      ...tail(ctx, frame("challenges", game), trail),
    ]),
  };
}

async function challengeScreen(id: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const { url, data } = await cardRef("challenge", { id });
  if (!data || data.kind !== "challenge") return notYet("That challenge is no longer live.", trail, [], ctx);

  const [joined, webUrl, gate, mine] = await Promise.all([
    ctx.gamer ? hasJoined(ctx.gamer.userId, id) : Promise.resolve(false),
    challengeUrl(siteUrl(), id),
    challengeGate(id),
    // Which of their accounts could enter. Two League accounts is ordinary,
    // and the bot used to enter them on whichever came back first.
    ctx.gamer ? entryAccounts(ctx.gamer.userId, id) : Promise.resolve([]),
  ]);
  const enteredWith = mine.find((a) => a.entered) ?? null;

  // The key was sent to the server the challenge belongs to, so in THAT server
  // the bot can show it and joining is one tap. Anywhere else you can watch the
  // whole thing and are asked for the key to enter.
  const ownHere = gate.locked && keyVisibleTo(gate, ctx.guildId ?? null);
  const footer = joined
    ? enteredWith
      // Naming the account is the whole point: with two linked, "you're in"
      // does not say which one has to be played for this to score.
      ? `You're in as ${enteredWith.inGameName} — only this account's play counts here.`
      : "You're in — your standing updates on every sync."
    : gate.locked
      ? (ownHere ? `Your server's entry key: ${gate.accessKey}` : "Entry needs the key sent to this challenge's server.")
      : mine.length > 1
        ? "Pick which account enters. The others stay free for other challenges."
        : undefined;

  // One button per account when there is a choice to make. Buttons rather than
  // a select menu because there are rarely more than two or three, and a button
  // is one tap where a select is three.
  const joinButtons = (): (Button | null)[] => {
    if (mine.length <= 1) return [button("Join challenge", actionId("join", [id], trail), ButtonStyle.Success, "🏆")];
    return mine.slice(0, 3).map((a) =>
      button(`Join as ${a.inGameName}`.slice(0, 40), actionId("join", [id, a.id], trail), ButtonStyle.Success, "🏆"));
  };

  return {
    embeds: [embed(url, { title: data.title, color: data.theme.accent, footer })],
    components: rows([
      ...(!ctx.gamer
        ? [linkButton("Continue with Discord to join", signInUrl(siteUrl(), new URL(webUrl).pathname), "🚀")]
        : joined
          ? [button("You've joined", actionId("noop", [], trail), ButtonStyle.Secondary, "✅")]
          : gate.locked && !ownHere
            ? [button("Enter with key", `open-key|${id}`, ButtonStyle.Primary, "🔑")]
            : joinButtons()),
      // THIS challenge's standings, not the game's lifetime board — those are
      // different lists and only one of them answers "where am I in this".
      navButton("Standings", frame("standings", id), [frame("challenge", id), ...trail], ButtonStyle.Secondary, "📊"),
      navButton(`${data.game} planet`.slice(0, 24), frame("planet", data.game), trail, ButtonStyle.Secondary, "🪐"),
      ...tail(ctx, frame("challenge", id), trail),
      linkButton("Full details", webUrl, "🔗"),
    ]),
  };
}

/**
 * THIS challenge's standings.
 *
 * The button used to go to the game's leaderboard, which is a different list
 * entirely: everyone who plays the game, ranked on a lifetime metric, most of
 * whom never entered this competition. Somebody pressing "Standings" on a
 * challenge card is asking where they are in THAT challenge, and the honest
 * answer is the points people have earned inside it.
 */
async function standingsScreen(id: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const here = frame("standings", id);
  const { url, data } = await cardRef("leaderboard", { challenge: id });
  if (!data) return notYet("Those standings aren't available yet.", trail, [], ctx);
  const title = data.kind === "leaderboard" ? data.title : "Standings";
  return {
    embeds: [embed(url, {
      title: `${title} — standings`,
      color: data.theme.accent,
      footer: "Points earned since each player entered. Updates on every sync.",
    })],
    components: rows([
      navButton("Back to the challenge", frame("challenge", id), trail, ButtonStyle.Primary, "🏆"),
      ...tail(ctx, here, trail),
    ]),
  };
}

// The door to a server-gated challenge. Everything else about the challenge is
// already on screen — this asks only for the code that server was given.
export function keyModal(challengeId: string) {
  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: `key|${challengeId}`.slice(0, 100),
      title: "Enter the challenge key",
      components: [{
        type: ComponentType.ActionRow,
        components: [{
          type: ComponentType.TextInput, custom_id: "key", style: 1, required: true,
          label: "Entry key", max_length: 32,
          placeholder: "The code sent to the server running this challenge",
        }],
      }],
    },
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

// ===== Server owner: run challenges for your community =====

// `/cluster show:admin challenges`. A server owner's whole reason to recruit for us
// is the revenue unlock, and the way they get there is a competition their
// members actually want to enter. This is where they run one.
async function adminScreen(arg: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  // `/cluster show:server` folds in here. It was a sibling command showing half the
  // picture — growth without the tools to act on it — so it is now a view of
  // the one admin command rather than a second thing to remember.
  if (arg === "growth" || arg === "server") return serverScreen(ctx, trail);
  if (!ctx.guildId) {
    return notYet("Run this inside your server — it manages that server's challenges.", trail, [], ctx);
  }
  // Requesting and running a challenge commits the server's name and the
  // owner's prize money, so it is gated on Discord's own permissions rather
  // than on merely being in the server.
  if (!ctx.isManager) {
    return notYet("Only this server's admins and moderators can run challenges here.", trail, [
      navButton("Server growth", frame("admin", "growth"), trail, ButtonStyle.Secondary, "📈"),
    ], ctx);
  }
  const here = frame("admin", arg);
  const [mine, pending, portal, guild] = await Promise.all([
    challengesForGuild(ctx.guildId),
    listRequests({ guildId: ctx.guildId, status: "pending" }),
    ensurePortal(ctx.guildId),
    getGuildRow(ctx.guildId),
  ]);

  const live = mine.filter((c) => c.status === "active" || c.status === "paused");
  const done = mine.filter((c) => c.status === "completed");

  const lines: string[] = [];
  if (pending.length) {
    lines.push(`**${pending.length} awaiting our review** — ${pending.map((p) => p.title).join(", ")}`);
    lines.push("We check every request before it goes live with Cluster's name on it. You'll get the key here the moment it's approved.");
    lines.push("");
  }
  if (live.length) {
    lines.push("**Running now**");
    for (const c of live) {
      const days = Math.max(0, Math.ceil((c.endAt.getTime() - Date.now()) / 86400000));
      const owned = c.guildId === ctx.guildId;
      lines.push(`• **${c.title}** — ${c.game} · ${c.status === "paused" ? "paused" : `${days}d left`}${owned ? "" : " *(hosted elsewhere)*"}`);
    }
    lines.push("");
  }
  if (done.length) lines.push(`**${done.length} finished** — trophies already handed out.`);
  if (portal) {
    lines.push("");
    lines.push(`**Your portal:** ${siteUrl()}/servers/${portal.slug} — every member's progress, the traffic your challenges send you, your tier and your badges. The key was DM'd to you at install; tap below to have it sent again.`);
  }
  if (!lines.length) {
    lines.push("You haven't run a challenge yet.");
    lines.push("");
    lines.push("A challenge is the fastest way to get your members linking their game accounts — which is what counts toward your revenue unlock. Pick a game, set the prize, and we review it before it goes live.");
  }

  // Managing a specific challenge: pause/resume/end, owner-only.
  const ownedLive = live.filter((c) => c.guildId === ctx.guildId);
  const controls: Button[] = ownedLive.slice(0, 2).flatMap((c) => ([
    c.status === "paused"
      ? button(`Resume ${c.title}`.slice(0, 40), actionId("ch-resume", [c.id], [here]), ButtonStyle.Success, "▶")
      : button(`Pause ${c.title}`.slice(0, 40), actionId("ch-pause", [c.id], [here]), ButtonStyle.Secondary, "⏸"),
    button(`End ${c.title}`.slice(0, 40), actionId("ch-end", [c.id], [here]), ButtonStyle.Danger, "🏁"),
  ]));

  const { url } = live[0]
    ? await cardRef("challenge", { id: live[0].id })
    : await cardRef("guide", { topic: "challenges" });
  return {
    embeds: [embed(url, {
      title: "Your server's challenges",
      description: lines.join("\n").slice(0, 3800),
      color: "#8b5cf6",
      footer: "Full control — progress, analytics, editing — lives in your server portal on the site.",
    })],
    components: rows([
      button("Request a challenge", `nav-req|${ctx.guildId}`, ButtonStyle.Primary, "🏆"),
      // The support channel, where an owner already is. Everything else here
      // is a switch; this is the one that reaches a person.
      button("Message Cluster", `open-msg|${ctx.guildId}`, ButtonStyle.Secondary, "💬"),
      // Discord is a good remote control and a poor dashboard. Everything with
      // depth — per-member progress, the traffic we send you, editing — is on
      // the site, so every owner screen points there rather than trying to
      // reproduce it in an embed.
      portal ? linkButton("Open your server portal", `${siteUrl()}/servers/${portal.slug}`, "🛰") : null,
      ...controls,
      button("DM me my portal key", actionId("portal-key", [], [here]), ButtonStyle.Secondary, "🔑"),
      ...live.slice(0, 2).map((c) => navButton(`View ${c.title}`.slice(0, 24), frame("challenge", c.id), [here], ButtonStyle.Secondary, "👁")),
      navButton("Server growth", frame("admin", "growth"), [here, ...trail], ButtonStyle.Secondary, "📈"),
      // The three switches that were only settable by us.
      //
      // Sponsored posts are the owner's revenue decision and the daily
      // competition post is the one thing that appears in their channel
      // uninvited — an owner who cannot turn either off ends up removing the
      // bot instead. Both say what they currently are, because a toggle whose
      // state you can't see is a toggle nobody trusts.
      button(
        guild?.adOptIn ? "Sponsored posts: on" : "Sponsored posts: off",
        actionId("ad-optin", [guild?.adOptIn ? "0" : "1"], [here]),
        guild?.adOptIn ? ButtonStyle.Success : ButtonStyle.Secondary, "💸",
      ),
      button(
        guild?.announcementsEnabled === false ? "Daily post: off" : "Daily post: on",
        actionId("announce", [guild?.announcementsEnabled === false ? "1" : "0"], [here]),
        guild?.announcementsEnabled === false ? ButtonStyle.Secondary : ButtonStyle.Success, "📣",
      ),
      navButton("Describe your community", frame("setup", ctx.guildId), [here, ...trail], ButtonStyle.Primary, "🧭"),
      button("Post the guides again", actionId("repost-guides", [], [here]), ButtonStyle.Secondary, "📚"),
      button("Use this channel", actionId("set-channel", [], [here]), ButtonStyle.Secondary, "📍"),
      ...tail(ctx, here, trail),
    ]),
  };
}

// Step one of a request: which game. Shown as the games card so the owner picks
// from what we actually track, not from memory.
async function requestGameScreen(ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  if (!ctx.guildId) return notYet("Run this inside your server.", trail, [], ctx);
  if (!ctx.isManager) return notYet("Only this server's admins and moderators can request a challenge.", trail, [], ctx);
  const games = await requestableGames();
  if (!games.length) return notYet("No games are available for challenges right now.", trail, [], ctx);

  const { url, data } = await cardRef("planets", {});
  return {
    embeds: [embed(url, {
      title: "Which game?",
      description:
        "Pick the game your community actually plays. We sync its stats from the official API, so the standings are real and nobody can inflate them.\n\n"
        + "Next you'll set the length, the prize and the trophies — then we review it.",
      color: data && "theme" in data ? data.theme.accent : "#8b5cf6",
    })],
    components: rows([
      ...games.slice(0, 20).map((g) => button(g.name.slice(0, 24), `open-req|${g.name}`, gameStyle(g.name), "🎮")),
      ...tail(ctx, frame("req-game"), trail),
    ]),
  };
}

// The request form itself. Discord modals allow five text inputs, which is
// exactly enough for the things only the owner can decide.
export function requestModal(game: string) {
  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: `req|${game}`.slice(0, 100),
      title: `Challenge on ${game}`.slice(0, 45),
      components: [
        textRow("title", "Challenge name", 1, true, `e.g. ${game} Ladder Week`, 80),
        textRow("description", "What are they competing for?", 2, false, "Tell your members what winning looks like", 400),
        textRow("days", "How many days should it run?", 1, true, "7", 3),
        textRow("prize", "Prize money you're putting up", 1, false, "e.g. 100 — leave blank for trophies only", 8),
        textRow("currency", "Currency", 1, false, "USD", 8),
      ],
    },
  };
}

/**
 * The one free-text question in the community profile.
 *
 * Menus can capture games and regions; they cannot capture "we're the biggest
 * Arabic-speaking Valorant server and we run scrims every Friday". That
 * sentence is what makes a sponsor pick this server over an identical one, so
 * there is exactly one box for it and nothing else.
 */
export function aboutModal(guildId: string) {
  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: `about|${guildId}`.slice(0, 100),
      title: "Describe your community",
      components: [
        textRow(
          "about", "In your own words", 2, false,
          "Who plays here, what they play, and what makes this server different", 400,
        ),
      ],
    },
  };
}

/**
 * Writing to Cluster, from inside Discord.
 *
 * This is a modal and not a DM listener because it has to be: we do not request
 * the Message Content intent, so the bot cannot read the text of a message sent
 * to it. Asking for that intent would mean Discord verification and the ability
 * to read every message in every server we're in — an enormous permission to
 * hold for a support inbox. A modal hands us exactly the text the owner meant
 * to send us and nothing else, which is the right amount of access.
 */
export function contactModal(guildId: string) {
  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: `msg|${guildId}`.slice(0, 100),
      title: "Message Cluster",
      components: [
        textRow(
          "body", "What's on your mind?", 2, true,
          "A challenge you want run, a problem with the bot, a brand you want here",
          1000,
        ),
      ],
    },
  };
}

function textRow(id: string, label: string, style: 1 | 2, required: boolean, placeholder: string, max: number) {
  return {
    type: ComponentType.ActionRow,
    components: [{
      type: ComponentType.TextInput, custom_id: id, style, required,
      label: label.slice(0, 45), max_length: max, placeholder: placeholder.slice(0, 100),
    }],
  };
}

// ===== Link a game account =====

// Discord modals are the one place a true modal is correct: a short form with
// text inputs. Everything else in this bot is an embed + buttons.
export function linkModal(game: string, provider: string) {
  // Each game asks for a DIFFERENT thing — Dota wants a numeric Friend ID,
  // Riot wants Name#TAG, Chess.com wants a username. Asking everyone for a
  // generic "game ID and region" is how you get accounts that fail to verify,
  // so the modal uses the registry's real label and hint for that provider.
  const p = getProvider(provider);
  const regions = REGION_HINTS[provider];
  // The registry's label is written for the WEBSITE, where the identifier is
  // one field — so Mobile Legends' reads "Player ID + Server (Zone) ID". Here
  // the zone gets a field of its own, and asking for it twice in one form is
  // how you get people typing the same number into both boxes.
  const raw = p?.identifierLabel ?? "In-game name";
  const label = (regions && raw.includes("+") ? raw.split("+")[0].trim() : raw).slice(0, 45);
  const hint = (p?.identifierHint ?? "Exactly as it appears in game").slice(0, 100);

  const components: unknown[] = [
    {
      type: ComponentType.ActionRow,
      components: [{
        type: ComponentType.TextInput, custom_id: "ign", style: 1, required: true,
        label, max_length: 64, placeholder: hint,
      }],
    },
  ];

  // Only ask for a region when the game actually has one — an unnecessary
  // field is a reason to abandon the form.
  if (regions) {
    components.push({
      type: ComponentType.ActionRow,
      components: [{
        type: ComponentType.TextInput, custom_id: "region", style: 1, required: false,
        label: regions.label.slice(0, 45), max_length: 24, placeholder: regions.hint.slice(0, 100),
      }],
    });
  }

  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: `link|${provider}|${game}`.slice(0, 100),
      title: `Link your ${game} account`.slice(0, 45),
      components,
    },
  };
}

// Games where the account lives on a specific server/shard, and what that
// game actually calls it.
const REGION_HINTS: Record<string, { label: string; hint: string }> = {
  "riot-lol": { label: "Region", hint: "EUW, NA, KR, EUNE, BR, TR, JP…" },
  "riot-valorant": { label: "Region", hint: "eu, na, ap, kr" },
  pubg: { label: "Platform / shard", hint: "steam, psn, xbox, kakao" },
  activision: { label: "Platform", hint: "battle, psn, xbl, steam" },
  faceit: { label: "Region", hint: "EU, NA, SA — optional" },
  "mobile-legends": { label: "Server (Zone) ID", hint: "The number after your Player ID" },
  battlenet: { label: "Region", hint: "us, eu, kr, tw" },
  osu: { label: "Mode", hint: "osu, taiko, fruits, mania — optional" },
};

// Which games this picker may offer.
//
// Built from the games catalog INTERSECTED with the providers that can actually
// link an account — not from the catalog alone. VALORANT is the case that broke
// it: it's a live game with a planet and a leaderboard, but VAL-* stats need
// Riot production approval, so its provider is identity-only and the modal has
// nothing to open. The button existed, the press handler resolved no provider,
// and Discord was answered with "do nothing" — a button that visibly does
// nothing at all, which is worse than not offering the game.
async function linkableFromCatalog(): Promise<{ name: string; value: string }[]> {
  const c = await catalog();
  const known = new Set(linkableGames().map((g) => g.game.toLowerCase()));
  const fromCatalog = c.games.filter((g) => known.has(g.value.toLowerCase()));
  // A platform with no games configured still has providers, so the picker is
  // never empty just because the catalog is.
  return fromCatalog.length
    ? fromCatalog
    : linkableGames().map((g) => ({ name: g.game, value: g.game }));
}

async function linkScreen(game: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  if (!ctx.gamer) return signInPrompt(ctx, trail);
  const linkable = await linkableFromCatalog();

  // Asked for a game we can't link? Say which, say why, and offer the ones we
  // can — rather than rendering a button that does nothing when pressed.
  if (game && !linkableProvider(game)) {
    const { url } = await cardRef("planets", {});
    return {
      embeds: [embed(url, {
        title: `${game} can't be linked yet`,
        description: `We track ${game} on the site, but its stats API isn't open to us yet, so there's no account to connect. Pick another game below — or link ${game} on the site and we'll switch it on the moment it opens up.`,
        color: "#fbbf24",
      })],
      components: rows([
        ...linkable.slice(0, 18).map((g) => button(g.name.slice(0, 24), `open-link|${g.value}`, gameStyle(g.value), "🎮")),
        ...tail(ctx, frame("link", ""), trail),
        linkButton("Link on the site instead", `${siteUrl()}/profile?tab=accounts`, "🌐"),
      ]),
    };
  }

  if (!game) {
    // The picker is a real card — every game's logo, in one image — with a
    // coloured button per game underneath it. "Which games can I link?" should
    // be answered by looking, not by reading a list of names.
    const { url, data } = await cardRef("planets", {});
    const games = linkable.slice(0, 20);
    return {
      embeds: [embed(url, {
        title: "Link a game account",
        description: "Pick your game, enter your in-game name, done. Stats sync from the official API — never self-reported.",
        color: data && "theme" in data ? data.theme.accent : "#8b5cf6",
      })],
      components: rows([
        // Straight to the modal for each game: one tap from here to typing a
        // name, rather than a screen in between that says the same thing.
        ...games.map((g) => button(g.name.slice(0, 24), `open-link|${g.value}`, gameStyle(g.value), "🎮")),
        ...tail(ctx, frame("link", ""), trail),
        linkButton("Link on the site instead", `${siteUrl()}/profile?tab=accounts`, "🌐"),
      ]),
    };
  }
  // The modal has to open from a fresh interaction, so this screen hands over a
  // button that triggers it rather than trying to open one from a deferred edit.
  const { url } = await cardRef("guide", { topic: "connect-account" });
  return {
    embeds: [embed(url, {
      title: `Link ${game}`,
      description: "Tap below and enter your in-game name. That's the whole setup — your rank, wins and more sync automatically from then on.",
      color: "#8b5cf6",
    })],
    components: rows([
      button(`Link my ${game} account`.slice(0, 40), `open-link|${game}`, ButtonStyle.Primary, "🔗"),
      navButton("A different game", frame("link", ""), trail, ButtonStyle.Secondary, "🎮"),
      ...tail(ctx, frame("link", game), trail),
      linkButton("Link on the site instead", `${siteUrl()}/profile?tab=accounts`, "🌐"),
    ]),
  };
}

// ===== The community profile: twenty seconds that make a server sellable =====
//
// A brand buying Discord asks for "PUBG players in MENA". Nothing we derive
// answers that on a server's first day — linked accounts take weeks and say
// nothing about where anyone is. The owner knows now, so this asks them, with
// select menus rather than a wall of buttons because the games list grows every
// time we connect another one.
//
// Every question is skippable and every answer is changeable. And the screen
// says WHY we are asking, because a form with no stated purpose gets answered
// carelessly or not at all.

async function communityScreen(arg: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  // Reachable from two places, and only one of them is inside a server.
  //
  // The install DM offers this button, and a DM has no guild and no member —
  // `isManager` is meaningless there. So the frame carries the guild id, and
  // access is granted to a manager of that guild OR to the Discord account we
  // recorded as its owner, which is the account the DM went to in the first
  // place. Anything else gets nothing: this describes a server to advertisers.
  const guildId = arg || ctx.guildId || "";
  if (!guildId) {
    return notYet("Run this inside your server — it describes that server to brands.", trail, [], ctx);
  }
  const row = await getGuildRow(guildId);
  const allowed = (ctx.isManager && ctx.guildId === guildId)
    || (!!row?.ownerDiscordId && row.ownerDiscordId === ctx.discordId);
  if (!allowed) {
    return notYet("Only this server's admins can describe the community.", trail, [], ctx);
  }
  const here = frame("setup", guildId);
  const [profile, cat, portal] = await Promise.all([
    getCommunity(guildId),
    catalog(),
    ensurePortal(guildId),
  ]);
  const done = completeness(profile);

  const said = (label: string, values: string[]) =>
    values.length ? `**${label}:** ${values.join(", ")}` : `**${label}:** —`;

  const lines = [
    "Brands buy challenges by game and by region. The faster we can describe your community, the sooner a sponsor picks it.",
    "",
    said("Games", profile.games),
    said("Where your members are", profile.regions.map(regionLabel)),
    said("What kind of community", profile.vibes.map(vibeLabel)),
    profile.about ? `**In your words:** ${profile.about}` : "**In your words:** —",
    "",
    done === 100
      ? "That is everything. You can change any of it whenever your community does."
      : `**${done}% described.** Every answer is optional — anything you skip just means we match you to fewer sponsors.`,
  ];

  const { url } = await cardRef("guide", { topic: "everything" });
  return {
    embeds: [embed(url, {
      title: "Describe your community",
      description: lines.join("\n"),
      color: done === 100 ? "#34d399" : "#8b5cf6",
      footer: "Only your server's admins can see or change this. It is shown to brands as audience, never as your members' data.",
    })],
    components: [
      // Three menus, each its own row — a select can never share a row with
      // anything. Ordered by how much a brand cares: game first, then region.
      selectRow(select(
        `set|games|${guildId}`,
        cat.games.map((g) => ({ label: g.name, value: g.value, default: profile.games.includes(g.value) })),
        { placeholder: "Which games does your community play?", max: 8 },
      )),
      selectRow(select(
        `set|regions|${guildId}`,
        REGIONS.map((r) => ({ label: r.label, value: r.key, default: profile.regions.includes(r.key) })),
        { placeholder: "Where are most of your members?", max: 4 },
      )),
      selectRow(select(
        `set|vibes|${guildId}`,
        VIBES.map((v) => ({ label: v.label, value: v.key, default: profile.vibes.includes(v.key) })),
        { placeholder: "What kind of community is it?", max: 4 },
      )),
      ...rows([
        button("Say it in your own words", `open-about|${guildId}`, ButtonStyle.Secondary, "✍"),
        portal ? linkButton("Your server portal", `${siteUrl()}/servers/${portal.slug}`, "🛰") : null,
        ...tail(ctx, here, trail),
      ]),
    ].filter(Boolean),
  };
}

// ===== Server growth (the owner's reason to recruit for us) =====

async function serverScreen(ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  if (!ctx.guildId) {
    return notYet("Run this inside a server — it shows that server's growth toward ad revenue.", trail, [], ctx);
  }
  const stats = await guildStats(ctx.guildId);
  if (!stats) return notYet("No data for this server yet. Members appear here as they start using Cluster.", trail, [], ctx);
  // The portal link is only useful to someone who can act on it, and the key
  // must never appear in a channel — so it's offered to managers as a DM.
  const portal = ctx.isManager ? await ensurePortal(ctx.guildId) : null;

  // A text bar reads better than a number in Discord, and it makes progress feel
  // like progress even at 3%.
  const filled = Math.round((stats.pct / 100) * 20);
  const bar = `${"█".repeat(filled)}${"░".repeat(20 - filled)}`;

  // The pay rate, in the same message as the counter. An owner asked to recruit
  // gamers should be able to see, without leaving Discord, what the next
  // hundred of them are worth.
  const pct = ownerPctFor(stats.linked);
  const next = nextEarnTier(stats.linked);
  const rate = pct > 0
    ? `You keep **${pct}%** of every sponsored challenge that runs here.`
    : "";
  const upgrade = next
    ? `**${(next.threshold - stats.linked).toLocaleString()} more** takes your share to **${next.ownerPct}%**.`
    : `You are at the top rate — **${pct}%** of every sponsored challenge, and Cluster keeps ${clusterPctFor(stats.linked)}%.`;

  const lines = stats.unlocked
    ? [
      `**${bar}** ${stats.pct}%`,
      "",
      "**Sponsored challenges are unlocked.** Brands running challenges in your community's games now post them here — and the prize money is won by your members.",
      rate,
      upgrade,
      "",
      `**${stats.linked.toLocaleString()}** members have linked a game · **${stats.joined.toLocaleString()}** have a Cluster profile`,
    ].filter(Boolean)
    : [
      `**${bar}** ${stats.pct}%`,
      "",
      `**${stats.linked.toLocaleString()} / ${stats.threshold.toLocaleString()}** members have joined Cluster *and* linked a game account.`,
      `**${stats.remaining.toLocaleString()} more** unlocks brand-sponsored challenges here — real prize money for the members who win them, and **${next?.ownerPct ?? 5}% of what the brand paid** for you.`,
      "",
      `${stats.joined.toLocaleString()} have a Cluster profile so far — linking a game is what counts.`,
    ];

  const { url } = await cardRef("guide", { topic: "everything" });
  return {
    embeds: [embed(url, {
      title: `${stats.name} — growth`,
      description: lines.join("\n"),
      color: stats.unlocked ? "#34d399" : "#8b5cf6",
      footer: "Only gamers who linked a game count — that's what advertisers pay for.",
    })],
    components: rows([
      ctx.isManager
        ? button("DM me my portal key", actionId("portal-key", [], trail), ButtonStyle.Primary, "🛰")
        : null,
      portal ? linkButton("Server portal", `${siteUrl()}/servers/${portal.slug}`, "📊") : null,
      ctx.isManager
        ? navButton("Run a challenge", frame("admin", ""), trail, ButtonStyle.Success, "🏆")
        : null,
      ...tail(ctx, frame("server"), trail),
      linkButton("Server owner guide", `${siteUrl()}/discord-bot`, "📈"),
    ]),
  };
}

// An honest empty state — never a raw error, never a dead end.
//
// Carries a card like every other reply. An empty state is exactly where a bare
// line of text reads as "the bot is broken" rather than "there's nothing here
// yet", and it's the screen a first-time visitor to a quiet server is most
// likely to hit.
async function notYet(message: string, trail: Frame[], extra: (Button | null)[] = [], ctx?: ScreenCtx): Promise<ScreenPayload> {
  const { url } = await cardRef("guide", { topic: "getting-started" });
  return {
    embeds: [embed(url, { description: message, color: "#8b5cf6" })],
    components: rows([
      ...extra,
      startHereButton(trail),
      ...(ctx ? tail(ctx, frame("empty"), trail) : [backButton(trail)]),
      linkButton("Open Cluster", siteUrl(), "🔗"),
    ]),
  };
}

// Screens that arrive with the growth + admin phases.
async function comingSoon(name: string, trail: Frame[]): Promise<ScreenPayload> {
  const { url } = await cardRef("guide", { topic: "everything" });
  return {
    embeds: [embed(url, {
      title: "Coming with the next release",
      description: `**${name}** isn't wired up yet. Everything on the site works today.`,
      color: "#8b5cf6",
    })],
    components: rows([linkButton("Open Cluster", siteUrl(), "🔗"), backButton(trail)]),
    flags: 64,
  };
}

// ===== Profile of the Week =====

// The one competition every gamer is already in.
//
// Voting is web-only and stays that way — a vote button in Discord would be a
// vote cast by whoever can be bothered to click in a server, which is a
// different contest from the one running on the site. So the bot's job here is
// to show the race and hand people the two things that put them in it: a linked
// account and a profile worth voting for.
export async function weekScreen(ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const here = frame("week");
  const t = [here, ...trail];
  const { url, data } = await cardRef("week", {});
  const w = data && data.kind === "week" ? data : null;
  const result = w?.mode === "result";

  const { currentWeek, weekBoard } = await import("@/lib/profile-week");
  const [week, board] = await Promise.all([currentWeek(), weekBoard({ limit: 3 })]);
  const stream = board.stream.live && board.stream.url ? board.stream.url : null;

  const lines = result
    ? [
        "The votes are in. The top three are on the card, and each of them has their trophy in their case.",
        "Monday the count restarts from zero — and everybody, including you, starts level.",
      ]
    : [
        "Every Cluster profile is entered from the day it exists. There is nothing to sign up for.",
        w && w.daysLeft > 0
          ? `Voting closes in ${w.daysLeft} day${w.daysLeft === 1 ? "" : "s"}, and the winners are called on stream on Sunday.`
          : "Voting is closed while the winners are called. It reopens Monday.",
        "Want in? Link a game account, make your profile yours, and share it — votes come from people who see it.",
      ];

  return {
    embeds: [embed(url, {
      title: result ? "Profile of the Week — called" : "Profile of the Week",
      description: lines.join("\n\n"),
      color: w?.theme.accent ?? "#fbbf24",
      footer: `Week of ${week.key} · voting runs Monday to Saturday in ${week.timezone}`,
    })],
    components: rows([
      linkButton(result ? "See the winners" : "Vote now", `${siteUrl()}/leaderboards/best-profile`, "🏆"),
      stream ? linkButton("Watch the announcement", stream, "📺") : null,
      customizeButton(),
      ...tail(ctx, here, t.slice(1)),
    ]),
  };
}

// ===== Game world =====

// A champion, agent, weapon or map — and its skins.
//
// The skins are the reason anyone opens this twice, so each one is a button
// that re-renders THIS card with a different splash rather than opening a new
// message. Discord's 100-char custom_id budget is the constraint: entity ids
// are short, skin names are not, so a skin is addressed by its INDEX.
export async function worldScreen(game: string, kind: string, id: string, skinIdx: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  if (!game || !id) return planetsScreen(ctx, trail);
  const { skinsOf } = await import("@/lib/discord/resolve");
  const skins = await skinsOf(game, kind, id);
  const idx = Number(skinIdx);
  const skin = Number.isFinite(idx) && idx >= 0 ? skins[idx]?.name ?? null : null;

  const { url, data } = await cardRef("world", { game, entityKind: kind, id, skin: skin ?? "" });
  if (!data || data.kind !== "world") return notYet(`Nothing in the ${game} world called that.`, trail, [], ctx);

  const here = frame("world", game, kind, id, skinIdx);
  const t = [here, ...trail];

  // Four skins at a time — Discord allows 25 buttons and the tail needs room,
  // so the rest are reachable by typing the skin name after the champion.
  const shown = skins.slice(0, 4);
  return {
    embeds: [embed(url, {
      title: skin ? `${data.name} — ${skin}` : data.name,
      description: data.role ? `${data.role} · ${game}` : game,
      color: data.theme.accent,
      footer: skins.length > 4
        ? `${skins.length} skins — type "/cluster show ${data.name} <skin>" for any of them`
        : undefined,
    })],
    components: rows([
      ...shown.map((sk, i) => button(
        sk.name.slice(0, 24),
        navId(frame("world", game, kind, id, String(i)), t.slice(1)),
        i === idx ? ButtonStyle.Primary : ButtonStyle.Secondary,
      )),
      skin ? navButton("Base look", frame("world", game, kind, id), trail, ButtonStyle.Secondary) : null,
      navButton(`${game} planet`.slice(0, 24), frame("planet", game), trail, ButtonStyle.Success, "🪐"),
      ...tail(ctx, here, trail),
      linkButton("Open the world", `${siteUrl()}/planets/${encodeURIComponent(game)}`, "🔗"),
    ]),
  };
}

// ===== Search =====

// "Did you mean…", and nothing else.
//
// This screen only exists because a flat search sometimes has a real tie — two
// gamers using the same handle on different games is the canonical case. Every
// result is a button, so a tie costs one extra tap and never a retype.
async function searchScreen(query: string, ctx: ScreenCtx, trail: Frame[]): Promise<ScreenPayload> {
  const { search } = await import("@/lib/discord/resolve");
  const { searchCard } = await import("@/lib/cards/data");
  const hits = await search(query);
  if (!hits.length) {
    return notYet(
      `Nothing on Cluster matches **${query.slice(0, 60)}**. Try a game, a gamer's name, a champion, or just \`/cluster\` for your own card.`,
      trail, [], ctx,
    );
  }
  const { getOrRenderCard } = await import("@/lib/cards/cache");
  const data = await searchCard(query, hits.map((h) => ({ label: h.label, sub: h.sub, kind: h.kind, imageUrl: h.imageUrl })));
  const hit = await getOrRenderCard("search", query.slice(0, 40) || "q", data).catch(() => null);
  const url = hit?.url ?? liveCardUrl("search", { q: query });

  const here = frame("search", query.slice(0, 40));
  return {
    embeds: [embed(url, {
      title: `${hits.length} matches for "${query.slice(0, 40)}"`,
      description: "More than one thing on Cluster answers to that. Pick the one you meant.",
      color: "#8b5cf6",
    })],
    components: rows([
      ...hits.slice(0, 8).map((h) => navButton(h.label.slice(0, 24), frame(h.screen, ...h.args), [here, ...trail], ButtonStyle.Primary)),
      ...tail(ctx, here, trail),
    ]),
  };
}

// ===== Dispatch =====

/**
 * Every reply the bot sends, with the sponsor's button under it.
 *
 * A card carries a brand's creative in its top-right corner, and a Discord
 * image is not clickable — so without this the brand gets an impression and no
 * possible click, forever. This is the click: one link button, drawn last,
 * under whatever the screen itself put there.
 *
 * It goes here rather than in each screen because the answer to "which screens
 * carry advertising" is all of them. Twenty-one screens all remembering to add
 * it is twenty-one chances to drop a brand's only clickable surface.
 */
export async function renderScreen(f: Frame, trail: Frame[], ctx: ScreenCtx): Promise<ScreenPayload> {
  const payload = await renderScreenBody(f, trail, ctx);
  const sponsored = withSponsorRow(payload, currentSponsor(), currentCardGuild());
  // The admin's wording, last: after the screen and after the sponsor, so it
  // reaches every button the message will actually carry. One choke point
  // rather than a rename in twenty-one screens.
  return { ...sponsored, components: withButtonCopy(sponsored.components, await buttonCopy()) };
}

async function renderScreenBody(f: Frame, trail: Frame[], ctx: ScreenCtx): Promise<ScreenPayload> {
  const [a = ""] = f.args;
  switch (f.screen) {
    case "home": return homeScreen(ctx, trail);
    case "more": return moreScreen(ctx, trail);
    case "market": return marketScreen(ctx, trail);
    case "help": return helpScreen(ctx, trail);
    case "show": return showScreen(a, ctx, trail, f.args[1] ?? "");
    case "gamer": return otherGamerScreen(a, f.args[1] ?? "", ctx, trail);
    case "quest": return questScreen(a, ctx, trail);
    case "quests": return questsScreen(ctx, trail);
    case "guide": return guideScreen(a, ctx, trail);
    case "planet": return planetScreen(a, ctx, trail);
    case "planets": return planetsScreen(ctx, trail);
    case "leaderboard": return leaderboardScreen(a, f.args[1] ?? "", ctx, trail);
    case "challenge": return challengeScreen(a, ctx, trail);
    case "standings": return standingsScreen(a, ctx, trail);
    case "challenges": return challengesScreen(a, ctx, trail);
    case "link": return linkScreen(a, ctx, trail);
    case "server": return serverScreen(ctx, trail);
    case "admin": return adminScreen(a, ctx, trail);
    case "setup": return communityScreen(a, ctx, trail);
    case "week": return weekScreen(ctx, trail);
    case "world": return worldScreen(a, f.args[1] ?? "", f.args[2] ?? "", f.args[3] ?? "", ctx, trail);
    case "search": return searchScreen(a, ctx, trail);
    case "req-game": return requestGameScreen(ctx, trail);
    default: return homeScreen(ctx, trail);
  }
}

// Where `/cluster <anything>` lands.
//
// The whole command is one box, so this is the parser for it. Values picked
// from the autocomplete arrive as `kind:arg` tokens and resolve exactly.
// Anything typed by hand and sent without picking — which people do constantly
// — is resolved against real data instead of being rejected: a game name opens
// that planet, a quest name opens that quest, and anything else is treated as
// somebody's name and looked up. Failing to a gamer search is the right last
// resort, because a name is what a person is most likely to have typed.
export async function screenForCommand(query: string): Promise<Frame> {
  const raw = (query ?? "").trim();
  if (!raw) return frame("home");

  // A value picked from the autocomplete, resolved exactly.
  //
  // This existed only as a claim in a comment. Every `kind:arg` token the
  // autocomplete produces — `planet:Chess`, `quest:conquest`, `gamer:hikaru` —
  // fell through to the fuzzy text search, which then hunted for a string
  // containing a colon and, finding nothing, opened the "did you mean" picker.
  // So the menu listed the right destinations and picking one took you to a
  // disambiguation card. It works because it was TYPED like a name often
  // enough that nobody noticed the picked path was broken.
  const picked = fromToken(raw);
  if (picked) return picked;

  // The five words that mean something on their own. Everything else — every
  // gamer, game, champion, board and challenge — goes through one search.
  const first = raw.split(/\s+/)[0].toLowerCase();
  const rest = raw.slice(first.length).trim();

  switch (first) {
    // `/cluster show <anything>`: the whole platform behind one word. The word
    // itself is optional — `/cluster jett` and `/cluster show jett` are the
    // same question — so this just strips it and searches what's left.
    case "show":
    case "search":
    case "find":
      return rest ? searchFrame(rest) : frame("home");

    case "link":
    case "connect":
      return frame("link", rest);

    // Voting IS the Profile of the Week screen. There is no second place to go.
    case "vote":
    case "votes":
    case "week":
      return frame("week");

    // The nouns people type.
    //
    // These screens all existed and were all reachable from a button, but only
    // some of them answered to their own name: "planets" worked and "planet"
    // fell through to a text search for the word "planet", which found nothing
    // and opened a did-you-mean card. Singular/plural is not a distinction any
    // human makes when typing a command, and the whole point of one box is that
    // the obvious thing works.
    //
    // With a game after them they scope: `planet chess`, `leaderboard chess`.
    case "planet":
    case "planets":
    case "games":
      return rest ? frame("planet", rest) : frame("planets");

    case "challenge":
    case "challenges":
      return frame("challenges", rest);

    case "leaderboard":
    case "leaderboards":
    case "board":
      return rest ? frame("leaderboard", rest) : frame("planets");

    case "quest":
    case "quests":
      return rest ? frame("quest", rest) : frame("quests");

    // A trophy case is part of a profile — there is no separate screen, and
    // sending someone to a search for the word "trophies" is worse than
    // sending them to the place their trophies actually are.
    case "trophy":
    case "trophies":
      return frame("show", "profile");

    // …but the SHOP is its own thing, and the words people type for it are the
    // words for shopping, not for trophies.
    case "market":
    case "marketplace":
    case "shop":
    case "store":
    case "buy":
    case "spend":
      return frame("market");

    // One admin command. `/cluster show:server` used to be a sibling that showed
    // half the picture; it is a button inside admin now.
    case "admin":
    case "server":
    case "manage":
      return frame("admin", first === "server" ? "growth" : rest);

    // The bot's own manual. `guide` and `help` used to be different screens
    // that both answered "how does this work" — they are one thing.
    case "help":
    case "guide":
    case "commands":
      return rest ? frame("guide", rest) : frame("help");

    case "more":
      return frame("more");
    case "share":
      return frame("show", "profile");
    default:
      break;
  }

  // No leading verb: the whole thing is the search.
  return searchFrame(raw);
}

/**
 * The `kind:arg` grammar the autocomplete emits.
 *
 * Only ever produced by us — a person types names, not tokens — so an
 * unrecognised prefix returns null and falls through to the search rather than
 * erroring. `world:` carries three parts because an entity is only unique
 * within a game and a kind.
 */
function fromToken(raw: string): Frame | null {
  const at = raw.indexOf(":");
  if (at <= 0) {
    // The prefix-free values from the same list.
    switch (raw.toLowerCase()) {
      case "profile": return frame("show", "profile");
      case "cp": return frame("show", "cp");
      case "planets": return frame("planets");
      case "week": return frame("week");
      case "challenges": return frame("challenges");
      case "admin": return frame("admin", "");
      default: return null;
    }
  }
  const kind = raw.slice(0, at).toLowerCase();
  const arg = raw.slice(at + 1).trim();

  switch (kind) {
    case "planet": return arg ? frame("planet", arg) : frame("planets");
    // The stats screen takes the `game:` prefix itself, so it is kept.
    case "game": return frame("show", `game:${arg}`);
    case "board":
    case "leaderboard": return frame("leaderboard", arg);
    case "quest": return arg ? frame("quest", arg) : frame("quests");
    case "guide": return frame("guide", arg);
    case "gamer": return frame("gamer", arg);
    case "link": return frame("link", arg);
    case "challenge": return frame("challenge", arg);
    case "challenges": return frame("challenges", arg);
    case "admin": return frame("admin", arg);
    case "search": return frame("search", arg);
    case "world": {
      // world:<game>:<kind>:<id> — and an id may itself contain a colon, so
      // only the first three separators are structural.
      const [game = "", entityKind = "", ...rest] = arg.split(":");
      const id = rest.join(":");
      return game && entityKind && id ? frame("world", game, entityKind, id) : null;
    }
    default: return null;
  }
}

// Run the flat search and turn its answer into a destination.
//
// One clear hit opens that thing. A genuine tie opens the picker. Nothing at
// all still opens the picker, which is where the "nothing matches" message
// lives — a dead end with an explanation beats a card about the wrong gamer.
async function searchFrame(query: string): Promise<Frame> {
  try {
    const { resolveShow } = await import("@/lib/discord/resolve");
    const r = await resolveShow(query);
    if (r.type === "open") return frame(r.hit.screen, ...r.hit.args);
  } catch { /* fall through to the picker, which explains itself */ }
  return frame("search", query.slice(0, 60));
}
