// The slash commands, and the door they open.
//
// ===== THE SIXTEENTH OMISSION, AND THE TOP OF THE FUNNEL =====
//
// The bot handled `Ping` and `MessageComponent`. That was all. There was no
// `ApplicationCommand` handling anywhere, no command was ever registered, and
// `readCommand` — the parser written for exactly this — sat in the dead-code
// list found by `94-export-reach`.
//
// Which means **buttons were the only way in**, and buttons only exist on an
// announced challenge card. A gamer in a server with no live challenge could
// not reach the bot at all. Meanwhile the bot's own Commands card advertised
// four commands, and `12-IDENTITY` told a gamer with no parent server to *"open
// Discord, go to a server that has Cluster and use `/cluster`"*.
//
// `docs/PLAN.md` §0.1's shape, at the top of the funnel: the email omission
// means somebody already in cannot cash out; this one means they cannot get in.
//
// ===== FOUR COMMANDS, BECAUSE THE BOT ALREADY PROMISES FOUR =====
//
// `screens/home.ts`'s Commands card names `/cluster`, `/challenges`, `/profile`
// and `/server`. Registering only the first would leave the card advertising
// three commands that do nothing, which is the same defect with a smaller
// blast radius. The three extras are aliases onto screens that already exist —
// no new surface, just a door onto each.

import { OptionType, readCommand, type CommandOption } from "./types.ts";
import { frame, type Frame } from "./components.ts";

/**
 * The least a slash-command payload has to be for this module to read it.
 *
 * Structural rather than the full `Interaction`, because there are two
 * `Interaction` types on this branch — `types.ts`'s and `interactions.ts`'s —
 * and making this depend on which one a caller happens to hold would be a
 * third opinion about the same payload.
 */
export type CommandInvocation = { data?: { name?: string; options?: CommandOption[] } };

/**
 * The exact `PUT /applications/{id}/commands` payload.
 *
 * Registered by the button on `/admin/preflight`, and named as a deploy step
 * in `docs/DEPLOYMENT.md`. Discord serves whatever was last PUT here, so this
 * array is the definition — not a description of one kept somewhere else.
 */
export const COMMANDS = [
  {
    name: "cluster",
    description: "Home — challenges, your trophies, the pool. Everything is one press from here",
    options: [
      {
        name: "show",
        description: "Jump straight to a screen: challenges, games, trophies, profile, server, help",
        type: OptionType.String,
        required: false,
      },
    ],
  },
  {
    name: "challenges",
    description: "This week's challenges, and the button to join one",
  },
  {
    name: "profile",
    description: "Your trophies, the challenges you have entered, and your standings",
  },
  {
    name: "server",
    description: "Server admins only — this server's pool position and earnings",
  },
] as const;

/**
 * The tokens `/cluster show:…` understands, in **v3's** vocabulary.
 *
 * Deliberately not `readCommand`'s old translation table, which spoke v1's:
 * `quest`, `planet`, `share` and a leaderboard `board`. Those name surfaces v3
 * deleted, and a live parser that still speaks them is the deleted product
 * finding its way back in through the door nobody watches. Every key below is
 * a screen that is actually registered — asserted by `60-bot`.
 */
const TOKENS: Record<string, string> = {
  "": "home",
  home: "home",
  challenges: "challenges",
  challenge: "challenges",
  games: "games",
  game: "games",
  trophies: "trophies",
  profile: "profile",
  me: "profile",
  entries: "entries",
  server: "server",
  community: "community",
  help: "help",
  commands: "commands",
};

/** `/challenges`, `/profile`, `/server` — an alias each onto a screen. */
const ALIASES: Record<string, string> = {
  challenges: "challenges",
  profile: "profile",
  server: "server",
};

/**
 * Which screen a slash command opens.
 *
 * ===== AN UNKNOWN WORD IS A SEARCH, NEVER A DEAD END =====
 *
 * `/cluster wednesday` is somebody trying something. The `search` screen
 * already exists and already handles a query it does not recognise, so an
 * unrecognised token goes there with the words they typed rather than to a
 * card telling them they were wrong. The one thing this may never return is
 * a screen that does not exist — that renders *"that screen has gone"*, which
 * reads like a stale button rather than a command we never built.
 */
export function commandFrame(interaction: CommandInvocation): Frame {
  const name = (interaction.data?.name ?? "").toLowerCase();

  const alias = ALIASES[name];
  if (alias) return frame(alias);

  const { query } = readCommand(interaction);
  const token = query.trim().toLowerCase();

  const known = TOKENS[token];
  if (known) return frame(known);

  // `gamer:slug` — the one token that carries an argument.
  const [head, ...rest] = token.split(":");
  if (head === "gamer" && rest.length > 0) return frame("gamer", rest.join(":"));

  return frame("search", token);
}
