// The buttons under a card, as copy an admin owns.
//
// Every reply the bot sends is a PNG with a row of buttons beneath it, and those
// buttons are the whole navigation surface of the product inside Discord.
// Their wording was hard-coded across twenty-one screens, which meant changing
// "Connect a game" to something friendlier was a deploy, and turning a button
// off for a while was not possible at all.
//
// A button is identified by its DEFAULT LABEL rather than by a tag threaded
// through forty call sites. That is deliberate: the default label is already
// unique per action, the screens stay readable, and a button whose wording is
// generated from live data (a game's name, a gamer's name) is automatically not
// editable — which is right, because there is nothing to edit.
//
// Copy is global, not per card kind: the same "Connect a game" appears under a
// dozen cards, and letting it say four different things in four places is how a
// bot starts feeling like four bots. The studio shows each card the buttons IT
// carries, so an admin still edits in context.

export const BUTTON_COPY_KEY = "discord.buttons";

export type ButtonEdit = {
  /** New wording. Empty keeps the default. */
  label?: string;
  /** New icon. Empty keeps the default; a non-emoji is dropped at send time. */
  emoji?: string;
  /** Off the card entirely. */
  hidden?: boolean;
};

export type ButtonCopy = Record<string, ButtonEdit>;

export type BotButton = {
  /** Stable id — and the default label the renderer matches on. */
  key: string;
  label: string;
  emoji?: string;
  note: string;
  /**
   * The card kinds this button appears under. Omitted means every card: the
   * navigation tail is on all of them by design.
   */
  on?: string[];
};

/**
 * Every button an admin can reword.
 *
 * Checked against the screens rather than imagined — each label here is a
 * literal in `screens.ts`. A registry entry whose label has drifted silently
 * stops matching, so the labels are the contract and are not to be "tidied" in
 * one file without the other.
 */
export const BOT_BUTTONS: BotButton[] = [
  // ===== The tail: on every card =====
  { key: "Connect a game", label: "Connect a game", emoji: "🎮", note: "Opens the link-your-account form. The single most important button in the product — it is how a Discord member becomes a Cluster gamer." },
  { key: "Continue with Discord", label: "Continue with Discord", emoji: "🚀", note: "Shown instead of the above to anyone who hasn't signed in yet." },
  { key: "My profile", label: "My profile", emoji: "👤", note: "Back to their own card from anywhere." },
  { key: "More", label: "More", emoji: "🧭", note: "The rest of the product, so no card has to choose between being complete and being readable." },
  { key: "Open Cluster", label: "Open Cluster", emoji: "🔗", note: "Out to the website." },
  {
    key: "Get help · our server",
    label: "Get help · our server",
    emoji: "💬",
    note: "On every card, once an HQ invite is set in Admin → Discord. A bot with no support channel is a bot people uninstall the first time something confuses them — and it is usually a five-second answer. Also the top of the funnel for our own community: the people most likely to join a Cluster server are the ones already using Cluster.",
  },
  {
    key: "Vote for Cluster · earn CP",
    label: "Vote for Cluster · earn CP",
    emoji: "⭐",
    note: "On every card. Bot-list ranking is votes, and the lists are how a server that has never heard of us finds us — this is the single button that grows the platform rather than the gamer's standing in it. The label names the trade rather than asking a favour, which is most of the conversion.",
  },

  // ===== The gamer's own card =====
  { key: "Share my profile", label: "Share my profile", emoji: "📣", note: "Posts their card publicly in the channel. The viral loop.", on: ["profile"] },
  { key: "Cluster Points", label: "Cluster Points", emoji: "⚡", note: "Their CP summary card.", on: ["profile"] },
  { key: "Customize profile", label: "Customize profile", emoji: "✨", note: "Out to the profile builder on the site.", on: ["profile"] },
  { key: "Full profile", label: "Full profile", emoji: "👤", note: "Opens another gamer's card inside Discord.", on: ["profile"] },
  { key: "Open profile", label: "Open profile", emoji: "🔗", note: "That gamer's public page on the site.", on: ["profile"] },
  { key: "Vote for this profile", label: "Vote for this profile", emoji: "⭐", note: "One vote per gamer per week — what decides Profile of the Week.", on: ["profile", "week"] },
  { key: "Profile of the Week", label: "Profile of the Week", emoji: "👑", note: "The weekly competition card.", on: ["profile", "week"] },

  // ===== Competition =====
  { key: "Join challenge", label: "Join challenge", emoji: "🏆", note: "Enters them. The conversion event a brand is paying for.", on: ["challenge"] },
  { key: "Standings", label: "Standings", emoji: "📊", note: "Who is winning right now.", on: ["challenge"] },
  { key: "Full details", label: "Full details", emoji: "🔗", note: "The challenge's page on the site.", on: ["challenge"] },
  { key: "Challenges", label: "Challenges", emoji: "🏆", note: "Everything live on this game.", on: ["planet", "game-stats", "leaderboard", "challenge"] },
  { key: "Leaderboard", label: "Leaderboard", emoji: "📊", note: "This game's board.", on: ["planet", "game-stats"] },
  { key: "Full board", label: "Full board", emoji: "🔗", note: "The whole leaderboard on the site.", on: ["leaderboard"] },

  // ===== Game planets =====
  { key: "My stats", label: "My stats", emoji: "📈", note: "Their own numbers in this game.", on: ["planet"] },
  { key: "All planets", label: "All planets", emoji: "🪐", note: "Back out to every game.", on: ["planet", "planets"] },

  // ===== Quests =====
  { key: "My quests", label: "My quests", emoji: "🗺", note: "Every quest they're on.", on: ["cp-summary", "quest"] },
  { key: "How to win", label: "How to win", emoji: "📖", note: "The guide card for this quest.", on: ["quest"] },
  { key: "Play the quest map", label: "Play the quest map", emoji: "🎮", note: "Out to the playable map.", on: ["quest"] },

  // ===== Guides =====
  { key: "Getting started", label: "Getting started", emoji: "📖", note: "The first guide, for someone who has just arrived.", on: ["guide"] },
  { key: "Commands", label: "Commands", emoji: "❓", note: "What they can type.", on: ["guide"] },
];

export const BUTTONS_BY_KEY = new Map(BOT_BUTTONS.map((b) => [b.key, b]));

/** The buttons a given card kind carries — the tail plus its own. */
export function buttonsForCard(kind: string): BotButton[] {
  return BOT_BUTTONS.filter((b) => !b.on || b.on.includes(kind));
}

/**
 * Validate stored copy.
 *
 * Everything here reaches Discord, which rejects the WHOLE message when one
 * button is malformed — an over-long label is not a cosmetic problem, it is
 * every command on every server going quiet. So labels are trimmed to Discord's
 * 80 and unknown keys are dropped rather than passed through.
 */
export function parseButtonCopy(raw: string | null | undefined): ButtonCopy {
  if (!raw) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return {}; }
  if (!parsed || typeof parsed !== "object") return {};
  const out: ButtonCopy = {};
  for (const [key, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (!BUTTONS_BY_KEY.has(key)) continue;
    const e = (v ?? {}) as Partial<ButtonEdit>;
    const label = typeof e.label === "string" ? e.label.trim().slice(0, 80) : "";
    const emoji = typeof e.emoji === "string" ? e.emoji.trim().slice(0, 8) : "";
    const hidden = e.hidden === true;
    if (!label && !emoji && !hidden) continue;
    out[key] = { ...(label ? { label } : {}), ...(emoji ? { emoji } : {}), ...(hidden ? { hidden } : {}) };
  }
  return out;
}

/** What a button should say and show, after the admin's edit. */
export function buttonAfterEdit(defaultLabel: string, copy: ButtonCopy): ButtonEdit | null {
  return copy[defaultLabel] ?? null;
}
