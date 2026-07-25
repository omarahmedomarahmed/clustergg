import { OptionType } from "@/lib/discord/types";

// One unified `/cluster` command. Typing `/cluster` makes Discord list every
// subcommand with its description inline — that IS the discovery surface, so
// the descriptions below are user-facing copy, not developer notes.
//
// Note on shape: `/cluster valorant` is impossible. Discord subcommands are a
// fixed registered enum, so a per-game subcommand would mean re-registering the
// command every time staff add a game. Instead the game is an autocompleting
// OPTION (`/cluster planet game:valorant`), which is live from the database and
// needs no redeploy.

const game = (desc: string) => ({
  name: "game", description: desc, type: OptionType.String, required: true, autocomplete: true,
});

export const CLUSTER_COMMAND = {
  name: "cluster",
  description: "Your gaming identity — profile, stats, quests, challenges and leaderboards",
  dm_permission: true,
  options: [
    {
      name: "home", description: "Your Cluster hub — profile, CP and quick actions", type: OptionType.SubCommand,
    },
    {
      name: "show", description: "Show a card: yours, or any gamer on Cluster", type: OptionType.SubCommand,
      options: [
        { name: "what", description: "profile, cp, a game or a quest", type: OptionType.String, required: false, autocomplete: true },
        // `/cluster show valorant SomeTag` — any gamer on the platform, from any
        // server. This is the command that makes the bot useful in a server
        // where nobody has signed up yet.
        { name: "gamer", description: "An in-game name, or a Discord handle", type: OptionType.String, required: false, autocomplete: true },
      ],
    },
    {
      name: "planet", description: "Open a game planet — challenges, leaderboard, top gamers", type: OptionType.SubCommand,
      options: [game("Which game")],
    },
    {
      name: "leaderboard", description: "Live standings for a game", type: OptionType.SubCommand,
      options: [game("Which game")],
    },
    {
      name: "challenge", description: "Live challenges you can join", type: OptionType.SubCommand,
      options: [{ ...game("Which game"), required: false }],
    },
    {
      name: "quest", description: "Your progress in a quest", type: OptionType.SubCommand,
      options: [{ name: "name", description: "Which quest", type: OptionType.String, required: false, autocomplete: true }],
    },
    {
      name: "link", description: "Link a game account so your stats sync automatically", type: OptionType.SubCommand,
      options: [game("Which game to link")],
    },
    {
      name: "share", description: "Post your profile card so people can vote for it", type: OptionType.SubCommand,
    },
    {
      name: "guide", description: "Re-post a how-to guide", type: OptionType.SubCommand,
      options: [{ name: "topic", description: "Which guide", type: OptionType.String, required: false, autocomplete: true }],
    },
    {
      name: "server", description: "Server owners: your growth toward unlocking ad revenue", type: OptionType.SubCommand,
    },
    {
      name: "admin", description: "Server admins: run challenges for your community", type: OptionType.SubCommand,
    },
    {
      name: "help", description: "What Cluster is and everything this bot can do", type: OptionType.SubCommand,
    },
  ],
};

export const ALL_COMMANDS = [CLUSTER_COMMAND];
