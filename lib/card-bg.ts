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
