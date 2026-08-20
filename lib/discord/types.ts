// The slice of Discord's interaction payloads we actually use. Hand-written
// rather than pulled from discord-api-types so the bot adds no dependency and
// the shapes stay readable next to the handlers that consume them.

export const InteractionType = {
  Ping: 1,
  ApplicationCommand: 2,
  MessageComponent: 3,
  Autocomplete: 4,
  ModalSubmit: 5,
} as const;

export const InteractionResponseType = {
  Pong: 1,
  ChannelMessageWithSource: 4,
  DeferredChannelMessageWithSource: 5,
  DeferredUpdateMessage: 6,
  UpdateMessage: 7,
  AutocompleteResult: 8,
  Modal: 9,
} as const;

export const MessageFlags = { Ephemeral: 64 } as const;

export const ComponentType = { ActionRow: 1, Button: 2, StringSelect: 3, TextInput: 4 } as const;
export const ButtonStyle = { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 } as const;

export const OptionType = {
  SubCommand: 1, SubCommandGroup: 2, String: 3, Integer: 4,
  Boolean: 5, User: 6, Channel: 7, Role: 8, Mentionable: 9, Number: 10,
} as const;

export type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

export type CommandOption = {
  name: string;
  type: number;
  value?: string | number | boolean;
  focused?: boolean;
  options?: CommandOption[];
};

export type Interaction = {
  id: string;
  type: number;
  token: string;
  application_id: string;
  guild_id?: string;
  channel_id?: string;
  locale?: string;
  member?: { user: DiscordUser; permissions?: string; nick?: string | null };
  user?: DiscordUser;
  /**
   * The message the component was attached to. Present on component
   * interactions only.
   *
   * `flags` is the field that matters: Discord sets bit 64 (`Ephemeral`) on a
   * message only that one person can see. Its ABSENCE means the message is
   * public — visible to the whole channel — which is the difference between a
   * button press being private navigation and a button press rewriting an
   * announcement for everybody. Nothing could read this before M5, so nothing
   * could tell the two apart.
   */
  message?: { id?: string; flags?: number; channel_id?: string };
  data?: {
    id?: string;
    name?: string;
    custom_id?: string;
    component_type?: number;
    values?: string[];
    options?: CommandOption[];
    components?: { components: { custom_id: string; value: string }[] }[];
  };
};

/**
 * Was the button pressed on a message the whole channel can see?
 *
 * ===== WHY THIS DECIDES HOW WE ANSWER =====
 *
 * Every button press used to be answered with `DeferredUpdateMessage` and an
 * edit of the original message. On an EPHEMERAL card that is exactly right —
 * the card belongs to one person, and editing it in place is what makes
 * navigation feel like an app rather than a stack of new messages.
 *
 * On a PUBLIC announcement it is a bug with an audience. The bot posts a
 * challenge announcement into a server's channel; one member taps a button on
 * it; the announcement is REPLACED, for everyone, with that member's private
 * screen. The next person to scroll past sees a stranger's stats where the
 * challenge used to be, and the announcement the server was paid to carry is
 * gone.
 *
 * So a press on a public message gets a NEW EPHEMERAL MESSAGE instead, and the
 * public card is left exactly as posted.
 */
export const isPublicMessage = (i: Interaction): boolean =>
  i.message != null && ((i.message.flags ?? 0) & MessageFlags.Ephemeral) === 0;

// The person who triggered an interaction: `member.user` in a guild, `user` in a DM.
export function actor(i: Interaction): DiscordUser | null {
  return i.member?.user ?? i.user ?? null;
}

// ===== `isGuildManager` WAS HERE, AND IT IS NOT COMING BACK =====
//
// It answered *"is this person staff here?"* with one boolean, which is the
// exact shape 12 §6 forbids: the owner/administrator line is where every money
// rule sits, and one predicate serving both jobs is one call site away from
// letting an administrator withdraw.
//
// It was also wrong on its own terms — it accepted **MANAGE_GUILD** as well as
// ADMINISTRATOR, and P2 grants neither of those two things: access is
// ADMINISTRATOR *or a role the owner mapped by hand*, and nothing else.
//
// It had zero call sites, which is the only reason it never caused anything.
// The replacement is `lib/portal/permissions.ts`, where the two questions are
// two functions and `mayWithdraw` is the only one that can say yes to money.

// Flatten `/cluster show:profile` into { query: "profile" }.
//
// ===== BOTH SHAPES, BECAUSE DISCORD SERVES WHATEVER WAS LAST SYNCED =====
//
// Options are read from the top level AND from a subcommand. A client that has
// not refreshed keeps sending the command definition it last saw, so a bot that
// changes shape has to understand the old one for a while or those gamers get
// silence until their client catches up.
//
// ===== WHAT WAS REMOVED, AND WHY IT MATTERED =====
//
// This used to end in a translation table mapping v1's subcommands onto v1's
// vocabulary: `quest`, `planet`, `share`, a leaderboard `board`. **Every one of
// those names a surface v3 deleted.** It was harmless only because nothing
// called this function; the moment the slash command was wired it would have
// been the deleted product's vocabulary, live, in the parser at the front door.
//
// There is no legacy client to serve either: no command was ever registered, so
// no Discord client anywhere is holding an older definition of ours. A
// subcommand's own name is now simply the token, which is the shape a future
// `/cluster challenges` would take anyway.
export function readCommand(i: {
  data?: { options?: CommandOption[] };
}): { query: string; focused?: string } {
  const top = i.data?.options ?? [];
  const subOpt = top.find((o) => o.type === OptionType.SubCommand);
  const flat = subOpt ? (subOpt.options ?? []) : top;

  const opts: Record<string, string> = {};
  let focused: string | undefined;
  for (const o of flat) {
    if (o.value != null) opts[o.name] = String(o.value);
    if (o.focused) focused = o.name;
  }

  // A subcommand names the screen; a flat invocation carries it in `show`.
  if (subOpt) return { query: subOpt.name.trim(), focused };
  return { query: (opts.show ?? Object.values(opts)[0] ?? "").trim(), focused };
}
