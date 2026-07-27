// Admin-set artwork + overlay for each *type* of card across the site (like the
// quest cards). Stored in the CMS as `card.bg.<type>` (image url) and
// `card.bg.<type>.dim` (0-100 veil strength). Applied as a plain CSS
// `background`, so it always paints behind card content — no z-index surgery.

export const CARD_BG_TYPES: { key: string; label: string; note: string }[] = [
  { key: "game", label: "Game cards", note: "Game tiles on the home galaxy and planet lists." },
  { key: "challenge", label: "Challenge cards", note: "Live challenge / event cards." },
  { key: "notification", label: "Notification cards", note: "Rows on the notifications page." },
  { key: "feed_myplanets", label: "Feed · My planets card", note: "Right-rail 'My planets' card on the feed." },
  { key: "feed_explore", label: "Feed · Explore planets card", note: "Right-rail 'Explore planets' card on the feed." },
  { key: "quest_rules", label: "Quest game · Rules screen", note: "Background art of the in-game 'Rules' panel (how CP is earned)." },
  { key: "quest_log", label: "Quest game · My log screen", note: "Background art of the in-game CP history panel." },
  { key: "quest_guide", label: "Quest game · Guide screen", note: "Background art of the in-game how-to-play panel." },
  { key: "quest_missions", label: "Quest game · Missions screen", note: "Background art of the in-game starter-missions panel." },
  // Discord bot PNG cards — the art behind every card the bot posts.
  { key: "bot_welcome", label: "Bot · Welcome card", note: "Backdrop of the bot's welcome + fallback cards." },
  { key: "bot_profile", label: "Bot · Profile snapshot", note: "Backdrop when a gamer has no custom banner." },
  { key: "bot_game", label: "Bot · Game stats card", note: "Backdrop for game stat cards (game art wins when set)." },
  { key: "bot_quest", label: "Bot · Quest + CP cards", note: "Backdrop for quest progress and CP summary cards." },
  { key: "bot_challenge", label: "Bot · Challenge card", note: "Backdrop for challenge cards (challenge cover wins)." },
  { key: "bot_leaderboard", label: "Bot · Leaderboard card", note: "Backdrop for leaderboard cards." },
  { key: "bot_planet", label: "Bot · Planet card", note: "Backdrop for a game planet card (that game's own globe art wins when set)." },
  { key: "bot_planets", label: "Bot · Game picker card", note: "Backdrop of the 'pick your game' card that every START HERE button opens." },
  { key: "bot_guide", label: "Bot · How-to guide cards", note: "Backdrop for the pinned how-to guide PNGs." },
  { key: "bot_week", label: "Bot · Profile of the Week", note: "Backdrop of the weekly vote standings and the Sunday winners card." },
  { key: "bot_world", label: "Bot · Game world / lore card", note: "Fallback behind a champion, agent, weapon or map. That entity's own splash art wins when it has one." },
  { key: "bot_search", label: "Bot · Search results card", note: "Backdrop of the 'did you mean' card when a search matches more than one thing." },
];

export const CARD_BG_KEYS = CARD_BG_TYPES.map((t) => t.key);
export const cardBgCmsKeys = CARD_BG_KEYS.flatMap((k) => [`card.bg.${k}`, `card.bg.${k}.dim`]);

export type CardBgMap = Record<string, { url: string; dim: number }>;

// Build a compact map from a raw CMS content object.
export function buildCardBgMap(content: Record<string, string>): CardBgMap {
  const map: CardBgMap = {};
  for (const k of CARD_BG_KEYS) {
    const url = content[`card.bg.${k}`] || "";
    const dim = Number(content[`card.bg.${k}.dim`]);
    map[k] = { url, dim: Number.isFinite(dim) ? Math.max(0, Math.min(100, dim)) : 55 };
  }
  return map;
}

// A CSS `background` value for a card type, or undefined when no art is set.
// `tint` is an optional accent gradient laid over the art (e.g. a game accent).
export function cardBgStyle(map: CardBgMap | undefined, type: string, tint?: string): string | undefined {
  const entry = map?.[type];
  if (!entry?.url) return undefined;
  const a = (entry.dim / 100).toFixed(2);
  const veil = `linear-gradient(180deg, ${tint ?? "rgba(4,5,26,0.15)"}, rgba(4,5,26,${a}))`;
  return `${veil}, url(${entry.url}) center/cover`;
}
