// Discord bot lists: where a bot is discovered, and how we get onto them.
//
// Discord has no app store. Bot lists ARE the discovery layer — directories
// servers browse by tag — and two things decide where a bot sits in them:
//
//   VOTES. Users vote for a bot every twelve hours, and vote count drives
//   position in every listing on every list. This is the growth loop, and it is
//   the one people forget: a bot that gives voters something climbs, and a bot
//   that doesn't, doesn't.
//
//   SERVER COUNT. A credibility and ranking signal, posted by us through each
//   list's API.
//
// ===== Why not the `dbots` npm package =====
//
// `dbots` is the standard answer and it is built around a long-running gateway
// client: you construct a Poster and it holds a `setInterval` that posts every
// N seconds. Cluster's bot is HTTP interactions on serverless — there is no
// process to hold an interval, and nothing to keep a client alive between
// requests. So the posting is done here, against the same endpoints, driven by
// the cron that already runs everything else periodic. One fewer dependency and
// it actually runs.
//
// ===== The keys =====
//
// Every list issues its own token after IT has approved the bot. There is no
// bulk source, which is why these are admin-editable settings rather than
// constants: getting listed is an operational task, and the code's job is to be
// ready the moment somebody pastes a token in.

export type BotList = {
  id: string;
  name: string;
  /** Where the listing lives, once approved. */
  site: string;
  /** Where a human submits the bot. */
  submitUrl: string;
  /** Where that human then finds the API token. */
  keyHint: string;
  /**
   * The stats endpoint. `{id}` is replaced with our application id.
   * Null for lists that have no posting API — still worth being listed on.
   */
  postUrl: string | null;
  /** The header the token goes in. Almost always `Authorization`. */
  authHeader: string;
  /** Whether the token is sent bare or with a scheme prefix. */
  authPrefix?: string;
  /** What the body calls the guild count. Lists disagree, so it's per-list. */
  countField: string;
  /** Some lists want the shard count too; harmless to include when they don't. */
  extra?: Record<string, number>;
  /** Does this list send vote webhooks we can reward? */
  votes: boolean;
  /** Roughly how big — for deciding what to chase first. */
  note: string;
};

/**
 * The lists worth being on, biggest first.
 *
 * Deliberately a short list rather than the ninety BotBlock tracks. Being on
 * every directory that exists is not a strategy — the traffic is concentrated
 * at the top, and each listing is a page somebody has to write and keep true.
 */
export const BOT_LISTS: BotList[] = [
  {
    id: "topgg",
    name: "Top.gg",
    site: "https://top.gg",
    submitUrl: "https://top.gg/bot/new",
    keyHint: "After approval: your project page → Integrations & API → copy the token. NOT your Discord bot token.",
    postUrl: "https://top.gg/api/bots/{id}/stats",
    authHeader: "Authorization",
    countField: "server_count",
    votes: true,
    note: "The largest by a distance, and the one with a paid advertising auction. Getting listed here is the single highest-value item on this page.",
  },
  {
    id: "dbl",
    name: "Discord Bot List",
    site: "https://discordbotlist.com",
    submitUrl: "https://discordbotlist.com/bots/new",
    keyHint: "Your bot's page → Edit → API token.",
    postUrl: "https://discordbotlist.com/api/v1/bots/{id}/stats",
    authHeader: "Authorization",
    authPrefix: "Bot ",
    countField: "guilds",
    votes: true,
    note: "Second by traffic. Also sends vote webhooks, so the vote reward works here too.",
  },
  {
    id: "botsgg",
    name: "Discord Bots (bots.gg)",
    site: "https://discord.bots.gg",
    submitUrl: "https://discord.bots.gg/bots/add",
    keyHint: "https://discord.bots.gg/docs — the token is shown once you're signed in.",
    postUrl: "https://discord.bots.gg/api/v1/bots/{id}/stats",
    authHeader: "Authorization",
    countField: "guildCount",
    votes: false,
    note: "Long-running and well indexed by search engines, which is where a lot of its value is.",
  },
  {
    id: "botlistme",
    name: "BotList.me",
    site: "https://botlist.me",
    submitUrl: "https://botlist.me/bots/new",
    keyHint: "Bot page → Edit → API.",
    postUrl: "https://api.botlist.me/api/v1/bots/{id}/stats",
    authHeader: "Authorization",
    countField: "server_count",
    votes: true,
    note: "Smaller, but free to be on and it costs one token to keep updated.",
  },
  {
    id: "botblock",
    name: "BotBlock (fan-out to the rest)",
    site: "https://botblock.org",
    submitUrl: "https://botblock.org/lists",
    keyHint: "No key of its own. It forwards a single post to every list you hold a key for — paste those keys above and this carries them.",
    // BotBlock takes the bot id in the BODY, not the path.
    postUrl: "https://botblock.org/api/count",
    authHeader: "",
    countField: "server_count",
    votes: false,
    note: "One POST that fans out to the long tail. Worth having once the big four are done, not before — it can only forward keys you already hold.",
  },
];

export const BOT_LIST_IDS = new Set(BOT_LISTS.map((l) => l.id));

/** Where each list's token is stored. Admin-editable, never in code. */
export const botListKeyName = (id: string) => `botlist.${id}.key`;
/** Whether we've asked to be listed there yet — a checklist, not a secret. */
export const botListStatusName = (id: string) => `botlist.${id}.status`;

export const BOT_LIST_CMS_KEYS = BOT_LISTS.flatMap((l) => [botListKeyName(l.id), botListStatusName(l.id)]);

export type ListStatus = "none" | "submitted" | "live";

export const LIST_STATUSES: { id: ListStatus; label: string }[] = [
  { id: "none", label: "Not submitted" },
  { id: "submitted", label: "Submitted — waiting on review" },
  { id: "live", label: "Live" },
];

/**
 * What a vote is worth.
 *
 * The whole reason to care about lists is that ranking is votes, and the way
 * every bot that climbs gets votes is by giving voters something. Cluster
 * already has the right currency: Cluster Points. A vote can be cast every
 * twelve hours on most lists, and the reward lands in a system the gamer
 * already cares about rather than in a parallel one invented for it.
 *
 * The AMOUNT is not defined here. It is the Signal quest's weight for the
 * `botlist_vote` action, editable in Admin → Quests like every other action's
 * weight — and, more to the point, it is what actually gets written to the
 * ledger. A constant here would be a second source of truth that the DM quotes
 * and the ledger contradicts, which is exactly the bug this comment replaced:
 * the reply promised a weekend double that nothing implemented.
 */
export const VOTE_ACTION = "botlist_vote" as const;

/** How often a list lets the same person vote. Every major list uses twelve
 *  hours, and the daily cap on the action is set from it rather than guessed. */
export const VOTE_COOLDOWN_HOURS = 12;
