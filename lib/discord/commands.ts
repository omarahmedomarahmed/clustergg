import { OptionType } from "@/lib/discord/types";

// One command, one box. `/cluster` and you're home; `/cluster <anything>` and
// you're wherever you asked to be.
//
// This replaced thirteen subcommands, several of which carried their own named
// options — so the real syntax was `/cluster show what:profile gamer:Faker`,
// and the syntax was the product. Discord also forbids running a command that
// has subcommands on its own, which meant `/cluster` by itself did nothing at
// all: the most obvious thing anyone would type was the one thing that failed.
//
// Now there is a single optional option. Leave it empty for your own card; type
// into it and the autocomplete answers live from the database with everything
// the bot can open — your games, every planet, every quest, every guide, live
// challenges, and the gamers other people are looking for. That is better
// discovery than a fixed enum could ever be, because it lists what actually
// exists right now rather than what was registered at deploy time.
//
// Registration matters here: this shape has no subcommands, so it is a genuine
// re-registration, not an edit. Run the register endpoint after deploying.

export const CLUSTER_COMMAND = {
  name: "cluster",
  description: "Your gaming identity — profile, stats, quests, challenges and leaderboards",
  dm_permission: true,
  options: [
    {
      // Named `show` so it reads as `/cluster show:<thing>` — the value goes in
      // directly, with no second option to fill in.
      name: "show",
      description: "A gamer, a game, a quest — or leave blank for your own card",
      type: OptionType.String,
      required: false,
      autocomplete: true,
    },
  ],
};

export const ALL_COMMANDS = [CLUSTER_COMMAND];
