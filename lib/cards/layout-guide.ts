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
    key: "strip", label: "Top strip", kind: "brand",
    x: 0, y: 0, w: 100, h: 14.6,
    note: "The one band every card keeps free (B54): the card's own identity on the left, our mark on the right, and everything below it is the body's. Held dark by a scrim, so art here reads as texture rather than subject.",
  },
  {
    key: "game-mark", label: "Game logo", kind: "art",
    x: 1.9, y: 0, w: 8.7, h: 16.5,
    note: "The GAME's logo, faint, under the identity line. Decoration — the text is drawn straight over it. Hidden automatically when the badge is already showing the same logo.",
  },
  {
    key: "mascot", label: "Astronaut", kind: "art",
    x: 82.1, y: 60.8, w: 15.8, h: 30.2,
    note: "The mascot stands in the column to the RIGHT of the text, below the badge. It was bottom-left at 200px until B54, which put it behind the last lines of every card's body — the cards with the most to say read the worst. Art here is covered on world cards, where the splash panel takes the same column.",
  },
  {
    key: "logo", label: "Cluster logo", kind: "brand",
    x: 86, y: 0, w: 11, h: 21,
    note: "Top-right, in the strip, on every card without exception. Drawn last and nothing may cover it — with a sponsor box in the corner it slides LEFT to clear the creative rather than being buried under it.",
  },
  {
    key: "ad", label: "Sponsor box", kind: "brand",
    x: 65, y: 2.9, w: 33.4, h: 23.4,
    note: "400px wide, top-right, on every card. This is inventory somebody paid for: it is drawn over everything, so art here is never seen.",
  },
  {
    key: "corner", label: "Badge under the sponsor", kind: "brand",
    x: 66, y: 28, w: 31, h: 18,
    note: "Game logo, level pill, or (on a challenge) the trophy row. Pushed below the sponsor box automatically.",
  },
];

// The column nearly every card puts its headline and stats in. Held dark by the
// scrim, so art here reads as texture rather than subject.
//
// It starts AT the top now (B54): its first section is the card's identity, and
// the strip's left is what that is for. And it is 78% wide rather than 58.5%,
// because the branding that used to sit bottom-right is in the strip — with one
// exception the guide cannot draw, since it depends on the card rather than on
// the kind: a SOLD card's column stops before the creative, because Satori has
// no float and text cannot wrap around a picture.
const TEXT_COLUMN: Region = {
  key: "text", label: "Text column", kind: "text",
  x: 4.7, y: 2.4, w: 78, h: 80,
  note: "Headline, subtitle and stat pills. The scrim darkens this hardest — put atmosphere here, never a face or a logo.",
};

/**
 * One editable section of a card's CONTENT — not of its artwork.
 *
 * `regions` above describe where art must stay out of the way. These describe
 * the things the renderer actually draws inside the content box, so an admin
 * can turn one off, resize it, or change the words it says without a deploy.
 *
 * `text` is the copy the renderer ships with. Only sections that HAVE fixed
 * copy carry it: a standings block's words are the standings, and a heading
 * that can be typed over a leaderboard is not a leaderboard. The editor offers
 * a text box only where this is set, and shows this as the placeholder.
 */
export type CardPart = {
  key: string;
  label: string;
  note: string;
  /** The built-in wording, when this section has any. */
  text?: string;
  /**
   * Drawn in the right-hand column under the sponsor box, not in the text one.
   *
   * Its rectangle is computed from the live layout rather than fixed here,
   * because it hangs off wherever the sponsor box currently sits — drag the ad
   * and this moves with it.
   */
  side?: boolean;
};

export type CardGuide = {
  kind: CardKind;
  name: string;
  summary: string;
  regions: Region[];
  /** The content sections of this card, in the order they are drawn. */
  parts: CardPart[];
  bgKey: string;   // the Card-backgrounds key that skins this card
  /**
   * What a gamer types (or presses) to make this card appear.
   *
   * Editing a layout without knowing which command produces it means guessing,
   * saving, and going to Discord to check. Printing it next to the canvas turns
   * that into a copy-paste.
   */
  command: string;
  /** Which family it belongs to, for the picker's grouping. */
  group: "gamer" | "game" | "competition" | "help";
};

export const CARD_GUIDES: CardGuide[] = [
  {
    kind: "profile",
    command: "/cluster  ·  /cluster show <gamer>",
    group: "gamer",
    name: "Gamer profile",
    summary:
      "A gamer's snapshot. Uses the gamer's OWN background if they set one in the profile builder, so platform art here is only the fallback.",
    bgKey: "bot_profile",
    regions: [
      ...COMMON,
      { key: "avatar", label: "Avatar + name", kind: "text", x: 4.6, y: 7, w: 55, h: 20, note: "Round avatar, display name, slug and title." },
      { key: "stats", label: "CP / views / votes", kind: "text", x: 4.6, y: 26, w: 50, h: 9, note: "Three pills in a row." },
      // Starts at 56, not 38: the trophy case and the arena rows are drawn
      // between the stat pills and the accounts, and an accounts region at 38
      // left the two of them three percent of the card to share — so the editor
      // drew both as slivers on top of it. This is where accounts actually
      // lands once the two sections above it have their space.
      { key: "accounts", label: "Linked accounts", kind: "text", x: 4.6, y: 56, w: 62, h: 26, note: "Up to six game cards, two per row, below the trophy case and the arena rows." },
    ],
    parts: [
      { key: "identity", label: "Avatar + name", note: "The round avatar, the display name and the profile link." },
      { key: "stats", label: "CP / views / votes", note: "The pill row under the name." },
      { key: "trophies", label: "Trophy case", note: "Up to five won trophies with their names.", text: "TROPHY CASE" },
      { key: "challenges", label: "In the arena", note: "The competitions this gamer is in right now.", text: "IN THE ARENA" },
      { key: "accounts", label: "Linked accounts", note: "Their connected game accounts.", text: "LINKED ACCOUNTS" },
    ],
  },
  {
    kind: "game-stats",
    command: "/cluster show <gamer> <game>",
    group: "gamer",
    name: "Game account",
    summary: "One game's live stats: rank, headline metrics, mains and recent matches.",
    bgKey: "bot_game",
    regions: [
      ...COMMON,
      TEXT_COLUMN,
      { key: "champs", label: "Champions / mains", kind: "text", x: 4.6, y: 45, w: 44, h: 22, note: "Icons with names — busy area, keep art plain." },
      { key: "matches", label: "Recent matches", kind: "text", x: 50, y: 45, w: 30, h: 22, note: "Win/loss rows." },
    ],
    parts: [
      { key: "identity", label: "In-game name + avatar", note: "The tag people searched for, and the human behind it." },
      { key: "live", label: "In-game pill", note: "Only drawn while they are actually in a match." },
      { key: "stats", label: "Stat tiles", note: "The headline numbers this game reports." },
      { key: "champions", label: "Most played", note: "Champion / legend / operator icons.", text: "MOST PLAYED" },
      { key: "matches", label: "Recent matches", note: "The last four results.", text: "RECENT MATCHES" },
      { key: "rank", label: "Board placing", note: "Where this account sits on the game's leaderboard." },
      { key: "empty", label: "Nothing-synced message", note: "Shown when the account has no stats yet.", text: "Stats sync shortly after linking — check back in a few minutes." },
    ],
  },
  {
    kind: "challenge",
    command: "/cluster show <challenge>",
    group: "competition",
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
      // Stops before the trophy column rather than running under it: at w:78
      // this region and the trophies region claimed the same rectangle, which
      // is a guide describing a card that cannot be drawn.
      { key: "timeline", label: "Timeline bar", kind: "text", x: 4.6, y: 47, w: 56, h: 7, note: "Start → end progress bar with dates. Stops short of the trophy column beside it." },
      { key: "standings", label: "Standings", kind: "text", x: 4.6, y: 58, w: 78, h: 32, note: "Up to four ranked rows on dark plates." },
    ],
    parts: [
      { key: "status", label: "LIVE / key / game pills", note: "The row above the title.", text: "LIVE" },
      { key: "title", label: "Title + description", note: "What the challenge is called and what it asks for." },
      { key: "meta", label: "Days left / joined / prize", note: "The pill row under the title." },
      { key: "rules", label: "Who can enter", note: "The entry requirement, in the game's own words — \"Gold or above in Solo/Duo\". Absent when a challenge is open to everyone, which is most of them." },
      { key: "timeline", label: "Timeline bar", note: "Start → end, so somebody can tell if they're early enough to matter." },
      { key: "standings", label: "Standings", note: "The top four right now.", text: "STANDINGS" },
      { key: "trophies", label: "Trophy stack", note: "The prizes, top-right under the sponsor." },
      { key: "empty", label: "No-scores message", note: "Shown before anybody has scored.", text: "No one has scored yet — first mover takes the lead." },
    ],
  },
  {
    kind: "leaderboard",
    command: "/cluster show <game> leaderboard",
    group: "competition",
    name: "Leaderboard",
    summary: "Top gamers for a game and metric. Rows fill most of the canvas.",
    bgKey: "bot_leaderboard",
    regions: [
      ...COMMON,
      { key: "title", label: "Title", kind: "text", x: 4.6, y: 7, w: 55, h: 16, note: "Board name and subtitle." },
      { key: "rows", label: "Ranked rows", kind: "text", x: 4.6, y: 26, w: 78, h: 64, note: "Eight rows with avatars. Almost nothing shows through here." },
    ],
    parts: [
      { key: "title", label: "Board name", note: "The board and what it measures." },
      { key: "rows", label: "Ranked rows", note: "The top eight." },
      { key: "empty", label: "Empty-board message", note: "Shown when nobody has posted a score.", text: "No one has posted a score yet — link an account and you top this board." },
    ],
  },
  {
    kind: "planet",
    command: "/cluster show <game>",
    group: "game",
    name: "Game planet",
    summary: "A game's hub: its live challenges and its boards, side by side.",
    bgKey: "bot_planet",
    regions: [
      ...COMMON,
      { key: "title", label: "Title", kind: "text", x: 4.6, y: 7, w: 55, h: 16, note: "Game name and how many gamers are on it." },
      { key: "columns", label: "Challenges + leaderboards", kind: "text", x: 4.6, y: 27, w: 78, h: 63, note: "Two columns of rows on dark plates. Almost nothing shows through here." },
    ],
    parts: [
      { key: "title", label: "Game name + gamer count", note: "How many gamers are on this planet, and how many from this server." },
      { key: "challenges", label: "Live challenges column", note: "What you can enter right now.", text: "LIVE CHALLENGES" },
      { key: "boards", label: "Leaderboards column", note: "Where you'd stand.", text: "LEADERBOARDS" },
    ],
  },
  {
    kind: "world",
    command: "/cluster show <champion | agent | weapon | map>",
    group: "game",
    name: "Game world / lore",
    summary:
      "A champion, agent, weapon or map. The entity's own splash is BOTH the background and a framed panel down the right, so the art is seen rather than just veiled.",
    bgKey: "bot_world",
    regions: [
      ...COMMON,
      // Starts at 13, not 7: the kind/role pills are drawn ABOVE the name, and a
      // title region that began at the very top of the content box left them
      // nowhere to go — so the editor drew them in a one-percent sliver on top
      // of the name. The region is the name and skin; the pills have the band
      // above it.
      { key: "title", label: "Name + skin", kind: "text", x: 4.6, y: 13, w: 55, h: 16, note: "The entity's name and the skin being shown. The kind and role pills sit in the band above this." },
      { key: "lore", label: "Lore", kind: "text", x: 4.6, y: 32, w: 52, h: 16, note: "A paragraph on a dark plate. Keep the LEFT half clear of character art." },
      { key: "abilities", label: "Abilities", kind: "text", x: 4.6, y: 48, w: 59, h: 34, note: "Up to four rows, each with the ability's own icon." },
      { key: "splash", label: "Splash panel", kind: "art", x: 64.5, y: 28, w: 34, h: 68, note: "The entity's splash, undimmed, between the sponsor box and the logo. Drawn by the renderer — nothing you put here shows." },
      { key: "pills", label: "Stats + skin count", kind: "text", x: 4.6, y: 85, w: 59, h: 9, note: "Bottom strip." },
    ],
    parts: [
      { key: "status", label: "Kind + role pills", note: "CHAMPION / AGENT / WEAPON, and the role." },
      { key: "title", label: "Name + skin", note: "The entity's name and which skin is being shown." },
      { key: "lore", label: "Lore", note: "A paragraph of the entity's story." },
      { key: "abilities", label: "Abilities", note: "Ability icon, name and what it does — up to four.", text: "ABILITIES" },
      { key: "art", label: "Splash banner", side: true, note: "The same splash as the background, drawn again undimmed as a framed banner in the right-hand column — directly below the sponsor box, and it moves when you move the sponsor box." },
      { key: "meta", label: "Stats + skin count", note: "The bottom pill strip." },
    ],
  },
  {
    kind: "search",
    command: "/cluster show <anything ambiguous>",
    group: "help",
    name: "Search results",
    summary: "The 'did you mean' card, shown only when a query matches more than one thing.",
    bgKey: "bot_search",
    regions: [
      ...COMMON,
      { key: "title", label: "The query", kind: "text", x: 4.6, y: 7, w: 60, h: 18, note: "What was typed, and how many things matched." },
      { key: "rows", label: "Result rows", kind: "text", x: 4.6, y: 28, w: 78, h: 62, note: "Up to six rows with thumbnails." },
    ],
    parts: [
      { key: "title", label: "The query", note: "What was typed, and how many things matched." },
      { key: "rows", label: "Result rows", note: "Up to six matches with thumbnails." },
    ],
  },
  {
    kind: "week",
    command: "/cluster show:vote  ·  the Sunday announcement",
    group: "competition",
    name: "Profile of the Week",
    summary: "The weekly vote — standings during the week, the podium on Sunday.",
    bgKey: "bot_week",
    regions: [
      ...COMMON,
      { key: "title", label: "Title", kind: "text", x: 4.6, y: 7, w: 60, h: 16, note: "'Profile of the Week' and the countdown line." },
      { key: "rows", label: "Placements", kind: "text", x: 4.6, y: 26, w: 78, h: 55, note: "Up to five ranked rows with avatars, or three big podium rows on Sunday." },
      { key: "pills", label: "Days left / prize", kind: "text", x: 4.6, y: 83, w: 78, h: 10, note: "The countdown and vote totals, or the trophy the podium won." },
    ],
    parts: [
      { key: "title", label: "Title + countdown line", note: "'Profile of the Week' and where the week is up to." },
      { key: "rows", label: "Placements", note: "The race during the week, the podium on Sunday." },
      { key: "pills", label: "Days left / prize", note: "The bottom strip." },
      { key: "empty", label: "No-votes message", note: "Shown at the start of a week before anybody has a vote.", text: "Nobody has a vote yet this week. Customize your profile and you are one vote from the top." },
    ],
  },
  {
    kind: "market",
    command: "/cluster market  ·  the Trophy marketplace button",
    group: "competition",
    name: "Trophy marketplace",
    summary: "Six trophies, two rows of three, each priced in Cluster Points AND in dollars.",
    bgKey: "bot_market",
    regions: [
      ...COMMON,
      { key: "title", label: "Title", kind: "text", x: 4.6, y: 6, w: 58, h: 13, note: "'Trophy marketplace' and the one-line pitch." },
      { key: "balance", label: "Their CP balance", kind: "text", x: 4.6, y: 20, w: 58, h: 8, note: "What the viewer has to spend, and what they've earned all-time." },
      { key: "tiles", label: "The six trophies", kind: "text", x: 4.6, y: 29, w: 60, h: 50, note: "Two rows of three tiles: art, name, tier, CP price and dollar value." },
      { key: "pills", label: "The exchange rate", kind: "text", x: 4.6, y: 89, w: 60, h: 8, note: "What CP is worth, and that spending never costs a level." },
    ],
    parts: [
      { key: "title", label: "Title", note: "The heading and the one-line pitch." },
      { key: "balance", label: "Their CP balance", note: "What they have to spend, stated before the shelf." },
      { key: "tiles", label: "The six trophies", note: "Both numbers on every tile — CP to buy, dollars to redeem." },
      { key: "pills", label: "The exchange rate", note: "The bottom strip." },
      { key: "empty", label: "Empty-shelf message", note: "Shown when no trophy is on sale.", text: "The shelf is empty right now — check back once staff put trophies up." },
    ],
  },
  {
    kind: "planets",
    command: "/cluster show planets  ·  every START HERE button",
    group: "game",
    name: "All games",
    summary: "The game picker — every logo as a tile. What START HERE opens.",
    bgKey: "bot_planet",
    regions: [
      ...COMMON,
      { key: "tiles", label: "Game logo grid", kind: "art", x: 4.6, y: 30, w: 78, h: 55, note: "Rows of game logos. Keep the middle band clear." },
    ],
    parts: [
      { key: "title", label: "Title", note: "The card's headline and subtitle." },
      { key: "tiles", label: "Game logo grid", note: "Every game as a tile." },
    ],
  },
  {
    kind: "quest",
    command: "/cluster show <quest>",
    group: "gamer",
    name: "Quest progress",
    summary: "A gamer's progress through one quest's tiers.",
    bgKey: "bot_quest",
    regions: [
      ...COMMON,
      TEXT_COLUMN,
      { key: "tiers", label: "Tier ladder", kind: "text", x: 4.6, y: 50, w: 78, h: 38, note: "Progress bar and tier chips." },
    ],
    parts: [
      { key: "title", label: "Quest name", note: "The quest and whose progress this is." },
      { key: "progress", label: "CP + progress bar", note: "How far to the next tier." },
      { key: "tiers", label: "Tier ladder", note: "Up to five tier chips." },
    ],
  },
  {
    kind: "cp-summary",
    command: "/cluster show cp",
    group: "gamer",
    name: "Cluster Points",
    summary: "Total CP and per-quest breakdown.",
    bgKey: "bot_quest",
    regions: [...COMMON, TEXT_COLUMN],
    parts: [
      { key: "title", label: "Title", note: "Whose quests these are, and their total." },
      { key: "quests", label: "Quest bars", note: "Up to four quests with their progress." },
    ],
  },
  {
    kind: "guide",
    command: "/cluster show:guide  ·  pinned on install",
    group: "help",
    name: "How-to guide",
    summary: "The pinned onboarding cards. Mostly text — art should be almost abstract.",
    bgKey: "bot_guide",
    regions: [
      ...COMMON,
      { key: "steps", label: "Numbered steps", kind: "text", x: 4.6, y: 30, w: 78, h: 55, note: "Two to four steps. The busiest text area of any card." },
    ],
    parts: [
      { key: "status", label: "Badge pill", note: "The small pill above the title." },
      { key: "title", label: "Title", note: "The guide's headline and subtitle." },
      { key: "steps", label: "Numbered steps", note: "Up to eight numbered steps." },
      { key: "footer", label: "Footer line", note: "The closing line under the steps." },
    ],
  },
];

export function guideFor(kind: string): CardGuide | null {
  return CARD_GUIDES.find((g) => g.kind === kind) ?? null;
}

/** The editable content sections of one card kind. */
export function partsFor(kind: string): CardPart[] {
  return guideFor(kind)?.parts ?? [];
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
