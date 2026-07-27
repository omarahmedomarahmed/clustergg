import type { CardKind } from "@/lib/cards/types";
import { DEFAULT_LAYOUT, type CardLayout, type Spot } from "@/lib/cards/layout";

// The design guide for card background art.
//
// A card is 1200x630. The renderer draws content into fixed regions of that
// canvas, so a background can be designed to fit rather than hoped at: put the
// focal point where nothing is drawn, keep detail out of the text column, and
// leave the corners alone.
//
// These numbers are the SAME ones `render.tsx` uses. If a region moves there it
// must move here, because this is what staff design against — a guide that
// drifts from the renderer is worse than no guide.

export const GUIDE_W = 1200;
export const GUIDE_H = 630;

export type Region = {
  key: string;
  label: string;
  // Percentages of the canvas, so the overlay scales with whatever preview size.
  x: number; y: number; w: number; h: number;
  kind: "text" | "art" | "brand" | "safe";
  note: string;
};

// Regions every card shares, whatever its kind.
const COMMON: Region[] = [
  {
    key: "accent-bar", label: "Accent bar", kind: "brand",
    x: 0, y: 0, w: 100, h: 1.3,
    note: "A gradient strip in the card's accent colours. Art behind it is never visible.",
  },
  {
    key: "mascot", label: "Astronaut", kind: "art",
    x: 0.8, y: 68, w: 19, h: 32,
    note: "The mascot stands here on every card, behind the content. Keep this corner of your art simple — a busy patch fights the figure.",
  },
  {
    key: "logo", label: "Cluster logo", kind: "brand",
    x: 79.5, y: 78, w: 19.5, h: 21,
    note: "The logo is drawn last and nothing may cover it. Leave this corner clear — it is the one place art must not compete.",
  },
  {
    key: "corner", label: "Top-right badge", kind: "brand",
    x: 66, y: 5, w: 31, h: 18,
    note: "Game logo, level pill, or (on a challenge) the trophy stack. Keep the top-right quiet.",
  },
];

// The left column, where nearly every card puts its headline and stats. Held
// dark by the scrim, so art here reads as texture rather than subject.
const TEXT_COLUMN: Region = {
  key: "text", label: "Text column", kind: "text",
  x: 4.6, y: 7, w: 60, h: 62,
  note: "Headline, subtitle and stat pills. The scrim darkens this hardest — put atmosphere here, never a face or a logo.",
};

export type CardGuide = {
  kind: CardKind;
  name: string;
  summary: string;
  regions: Region[];
  bgKey: string;   // the Card-backgrounds key that skins this card
};

export const CARD_GUIDES: CardGuide[] = [
  {
    kind: "profile",
    name: "Gamer profile",
    summary:
      "A gamer's snapshot. Uses the gamer's OWN background if they set one in the profile builder, so platform art here is only the fallback.",
    bgKey: "bot_profile",
    regions: [
      ...COMMON,
      { key: "avatar", label: "Avatar + name", kind: "text", x: 4.6, y: 7, w: 55, h: 20, note: "Round avatar, display name, slug and title." },
      { key: "stats", label: "CP / views / votes", kind: "text", x: 4.6, y: 26, w: 50, h: 9, note: "Three pills in a row." },
      { key: "accounts", label: "Linked accounts", kind: "text", x: 4.6, y: 38, w: 62, h: 26, note: "Up to six game cards, two per row." },
    ],
  },
  {
    kind: "game-stats",
    name: "Game account",
    summary: "One game's live stats: rank, headline metrics, mains and recent matches.",
    bgKey: "bot_game",
    regions: [
      ...COMMON,
      TEXT_COLUMN,
      { key: "champs", label: "Champions / mains", kind: "text", x: 4.6, y: 45, w: 44, h: 22, note: "Icons with names — busy area, keep art plain." },
      { key: "matches", label: "Recent matches", kind: "text", x: 50, y: 45, w: 30, h: 22, note: "Win/loss rows." },
    ],
  },
  {
    kind: "challenge",
    name: "Challenge",
    summary: "The competition poster and scoreboard in one. The most content-dense card — treat its art as a backdrop only.",
    bgKey: "bot_challenge",
    regions: [
      ...COMMON.filter((r) => r.key !== "corner"),
      {
        key: "trophies", label: "Trophy stack", kind: "brand",
        x: 62, y: 5, w: 35, h: 46,
        note: "Game logo with up to three trophies stacked beneath it, right-aligned. Keep the whole right edge clear down to the halfway line.",
      },
      TEXT_COLUMN,
      { key: "timeline", label: "Timeline bar", kind: "text", x: 4.6, y: 47, w: 78, h: 7, note: "Start → end progress bar with dates." },
      { key: "standings", label: "Standings", kind: "text", x: 4.6, y: 58, w: 78, h: 32, note: "Up to four ranked rows on dark plates." },
    ],
  },
  {
    kind: "leaderboard",
    name: "Leaderboard",
    summary: "Top gamers for a game and metric. Rows fill most of the canvas.",
    bgKey: "bot_leaderboard",
    regions: [
      ...COMMON,
      { key: "title", label: "Title", kind: "text", x: 4.6, y: 7, w: 55, h: 16, note: "Board name and subtitle." },
      { key: "rows", label: "Ranked rows", kind: "text", x: 4.6, y: 26, w: 78, h: 64, note: "Eight rows with avatars. Almost nothing shows through here." },
    ],
  },
  {
    kind: "planet",
    name: "Game planet",
    summary: "A game's hub: its live challenges and its boards, side by side.",
    bgKey: "bot_planet",
    regions: [
      ...COMMON,
      { key: "title", label: "Title", kind: "text", x: 4.6, y: 7, w: 55, h: 16, note: "Game name and how many gamers are on it." },
      { key: "columns", label: "Challenges + leaderboards", kind: "text", x: 4.6, y: 27, w: 78, h: 63, note: "Two columns of rows on dark plates. Almost nothing shows through here." },
    ],
  },
  {
    kind: "world",
    name: "Game world / lore",
    summary: "A champion, agent, weapon or map. The entity's own splash is the background.",
    bgKey: "bot_world",
    regions: [
      ...COMMON,
      { key: "title", label: "Name + kind", kind: "text", x: 4.6, y: 7, w: 55, h: 22, note: "The kind pill, the name, and the skin being shown." },
      { key: "lore", label: "Lore", kind: "text", x: 4.6, y: 32, w: 52, h: 22, note: "A paragraph on a dark plate. Keep the LEFT half clear of character art." },
      { key: "abilities", label: "Abilities", kind: "text", x: 4.6, y: 56, w: 52, h: 26, note: "Up to three rows. Character art usually lives on the right." },
      { key: "pills", label: "Stats + skin count", kind: "text", x: 4.6, y: 85, w: 78, h: 9, note: "Bottom strip." },
    ],
  },
  {
    kind: "search",
    name: "Search results",
    summary: "The 'did you mean' card, shown only when a query matches more than one thing.",
    bgKey: "bot_search",
    regions: [
      ...COMMON,
      { key: "title", label: "The query", kind: "text", x: 4.6, y: 7, w: 60, h: 18, note: "What was typed, and how many things matched." },
      { key: "rows", label: "Result rows", kind: "text", x: 4.6, y: 28, w: 78, h: 62, note: "Up to six rows with thumbnails." },
    ],
  },
  {
    kind: "week",
    name: "Profile of the Week",
    summary: "The weekly vote — standings during the week, the podium on Sunday.",
    bgKey: "bot_week",
    regions: [
      ...COMMON,
      { key: "title", label: "Title", kind: "text", x: 4.6, y: 7, w: 60, h: 16, note: "'Profile of the Week' and the countdown line." },
      { key: "rows", label: "Placements", kind: "text", x: 4.6, y: 26, w: 78, h: 55, note: "Up to five ranked rows with avatars, or three big podium rows on Sunday." },
      { key: "pills", label: "Days left / prize", kind: "text", x: 4.6, y: 83, w: 78, h: 10, note: "The countdown and vote totals, or the trophy the podium won." },
    ],
  },
  {
    kind: "planets",
    name: "All games",
    summary: "The game picker — every logo as a tile. What START HERE opens.",
    bgKey: "bot_planet",
    regions: [
      ...COMMON,
      { key: "tiles", label: "Game logo grid", kind: "art", x: 4.6, y: 30, w: 78, h: 55, note: "Rows of game logos. Keep the middle band clear." },
    ],
  },
  {
    kind: "quest",
    name: "Quest progress",
    summary: "A gamer's progress through one quest's tiers.",
    bgKey: "bot_quest",
    regions: [
      ...COMMON,
      TEXT_COLUMN,
      { key: "tiers", label: "Tier ladder", kind: "text", x: 4.6, y: 50, w: 78, h: 38, note: "Progress bar and tier chips." },
    ],
  },
  {
    kind: "cp-summary",
    name: "Cluster Points",
    summary: "Total CP and per-quest breakdown.",
    bgKey: "bot_quest",
    regions: [...COMMON, TEXT_COLUMN],
  },
  {
    kind: "guide",
    name: "How-to guide",
    summary: "The pinned onboarding cards. Mostly text — art should be almost abstract.",
    bgKey: "bot_guide",
    regions: [
      ...COMMON,
      { key: "steps", label: "Numbered steps", kind: "text", x: 4.6, y: 30, w: 78, h: 55, note: "Two to four steps. The busiest text area of any card." },
    ],
  },
];

export function guideFor(kind: string): CardGuide | null {
  return CARD_GUIDES.find((g) => g.kind === kind) ?? null;
}

// A short brief staff can hand to an artist (or paste into an image prompt)
// when commissioning seasonal art for a card.
//
// Built from the card's LIVE layout, not from the diagram. An admin who drags
// the mascot to the top-right and then hands an artist a brief still saying
// "keep the bottom-left clear" has been given the wrong instructions by their
// own tool — which is worse than having no tool.
export function artBrief(guide: CardGuide, layout: CardLayout = DEFAULT_LAYOUT): string {
  const busy = guide.regions.filter((r) => r.kind === "text").map((r) => r.label);
  const clear = [
    layout.mascot.hidden ? null : `the mascot at ${where(layout.mascot)}`,
    layout.mark.hidden ? null : `the Cluster logo at ${where(layout.mark)}`,
    layout.badge.hidden ? null : `the badge at ${where(layout.badge)}`,
    layout.bar ? "the accent strip along the top edge" : null,
  ].filter(Boolean);
  return [
    `${guide.name} card — ${GUIDE_W}x${GUIDE_H}px.`,
    guide.summary,
    clear.length ? `Keep clear: ${clear.join(", ")}.` : "",
    `Text is drawn over: ${busy.join(", ")} — keep these areas low-contrast and free of faces, text or logos.`,
    layout.scrim
      ? "The renderer darkens the left half and the bottom strip, so a focal point works best in the upper-right third."
      : `The renderer darkens the whole image by ${layout.dim}% and nothing else, so the art carries evenly across the card.`,
  ].filter(Boolean).join(" ");
}

// "the upper-left", "the centre" — a position an artist can work from, rather
// than a percentage pair they'd have to convert.
function where(s: Spot): string {
  const v = s.y < 34 ? "top" : s.y > 66 ? "bottom" : "middle";
  const h = s.x < 34 ? "left" : s.x > 66 ? "right" : "centre";
  return v === "middle" && h === "centre" ? "the centre" : `${v}-${h}`;
}
