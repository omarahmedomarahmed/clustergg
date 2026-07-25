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

// The person who triggered an interaction: `member.user` in a guild, `user` in a DM.
export function actor(i: Interaction): DiscordUser | null {
  return i.member?.user ?? i.user ?? null;
}

// Guild-level "is this person staff here?" — ADMINISTRATOR (0x8) or MANAGE_GUILD (0x20).
export function isGuildManager(i: Interaction): boolean {
  const p = BigInt(i.member?.permissions ?? "0");
  return (p & 0x8n) !== 0n || (p & 0x20n) !== 0n;
}

// Flatten `/cluster show what:profile` into { sub: "show", opts: { what: "profile" } }.
export function readCommand(i: Interaction): { sub: string; opts: Record<string, string>; focused?: string } {
  const top = i.data?.options ?? [];
  const subOpt = top.find((o) => o.type === OptionType.SubCommand);
  const sub = subOpt?.name ?? "home";
  const opts: Record<string, string> = {};
  let focused: string | undefined;
  for (const o of subOpt?.options ?? []) {
    if (o.value != null) opts[o.name] = String(o.value);
    if (o.focused) focused = o.name;
  }
  return { sub, opts, focused };
}
