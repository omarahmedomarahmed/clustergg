import type { CardKind } from "@/lib/cards/types";
import { parseRefs } from "@/lib/cards/refs";

// Where every element lands on a rendered PNG card — under admin control.
//
// The renderer used to hard-code its own geometry: mascot bottom-left, logo
// bottom-right, badge top-right, and a fixed content box between them. That is
// a reasonable default and a terrible law. Background art is commissioned per
// season and per game; the one thing an artist always needs is for the mascot
// to move off the thing they drew, and the one thing staff could never do was
// move it.
//
// So the geometry is data. Each card kind has a layout stored in platform
// settings under `card.layout.<kind>`; anything unset falls back to the house
// default, which is exactly what the renderer drew before. A layout is pure
// numbers — no HTML, no colours from the admin — so nothing here can reach
// Satori as an unparseable style and take a card down.
//
// Positions are PERCENTAGES of the 1200x630 canvas, not pixels, so the editor's
// drag handles and the renderer agree at any preview size, and the same layout
// survives a canvas resize.
//
// This module is deliberately free of server imports: the drag editor is a
// client component and needs the same types, defaults and geometry the renderer
// uses. Reading a stored layout lives in `layout-store.ts`.

export const CANVAS_W = 1200;
export const CANVAS_H = 630;

/** An element that can be dragged, resized, flipped and faded. */
export type Spot = {
  /** Centre of the element, as a % of canvas width/height. */
  x: number;
  y: number;
  /** Rendered size in canvas pixels (width for images, the box for the badge). */
  size: number;
  hidden?: boolean;
  /** Mirror horizontally / vertically. An astronaut can face the other way. */
  flipX?: boolean;
  flipY?: boolean;
  /** Degrees, -180..180. */
  rotate?: number;
  /** 0-100. Lets art sit UNDER the text instead of competing with it. */
  opacity?: number;
};

/** The block the card's own content is drawn into. Percentages, edges. */
export type ContentBox = { x: number; y: number; w: number; h: number };

/**
 * One named piece of a card's content — a title, a row list, a stat strip.
 *
 * Each card kind declares its own parts (see `layout-guide.ts`), and this is
 * what an admin turns off or resizes without touching code. `scale` multiplies
 * the part's type size, so "make the standings bigger" is one number rather
 * than a redesign.
 */
export type PartStyle = {
  hidden?: boolean;
  /** Type-size multiplier, 0.5–2. */
  scale?: number;
  /** 0-100. */
  opacity?: number;
  /**
   * Replace this section's own words.
   *
   * Only the section's fixed copy — a heading, a label, a caption. The live
   * data underneath is never overridable, because a leaderboard whose standings
   * can be typed in by hand is not a leaderboard.
   */
  text?: string;
  /**
   * Where this section sits, as a nudge from where the flow put it.
   *
   * An OFFSET rather than an absolute position, and the distinction is the
   * whole design. Sections are drawn in a flex column so that hiding one gives
   * its space to the next; absolutely positioning every block would break that
   * and, worse, would be a lie — the editor cannot measure how tall a section
   * will be once Satori has wrapped real text at render time, so a block pinned
   * to a y-coordinate would overlap its neighbour the first time somebody's
   * name ran long. A nudge composes with the flow instead of fighting it.
   *
   * Canvas pixels, so they mean the same thing at any preview size.
   */
  dx?: number;
  dy?: number;
  /**
   * This section's own width, as a % of the canvas.
   *
   * Unset means "as wide as the content box". Narrowing one section is how you
   * keep a lore paragraph off a character's face without shrinking the whole
   * column.
   */
  w?: number;
  /**
   * Where this section comes in the stack. Lower is higher up.
   *
   * Unset means the order the renderer declares, which is the order in the
   * card's guide. Reordering is the single most-requested layout change and
   * the only one that a flex column makes genuinely safe.
   */
  order?: number;
};

/**
 * An arbitrary image an admin dropped onto a card.
 *
 * This is what makes the editor a real canvas rather than three draggable
 * fixtures: any planet globe, quest map, trophy render or seasonal flourish can
 * be placed on any card, at any size, in front of or behind the content.
 */
export type CardAsset = {
  id: string;
  url: string;
  /**
   * Take the image from the CARD instead of from a fixed URL.
   *
   * A placed image was always one specific file, which is right for a seasonal
   * flourish and useless for the thing people actually want: a slot that shows
   * *this* champion's splash, *this* gamer's avatar, *this* game's logo — a
   * frame whose contents change with the card. Without it, "put the splash on
   * the right" could only be done by pinning one champion's art to every world
   * card.
   *
   * `url` stays as the fallback for when a card has nothing to put here, so a
   * slot is never an empty rectangle.
   */
  source?: string;
  /** Centre, as a % of the canvas. */
  x: number;
  y: number;
  /** Width in canvas pixels; height follows `ratio`. */
  w: number;
  /** height / width. 1 is square. */
  ratio: number;
  opacity: number;
  flipX?: boolean;
  flipY?: boolean;
  rotate?: number;
  /** Behind the card's content (default) or on top of it. */
  front?: boolean;
};

/**
 * The layout SCHEMA version. Bump it when a redesign changes what the stored
 * numbers mean.
 *
 * WHY THIS EXISTS, because it cost real cards going out to real servers looking
 * broken: `parseLayout` merges a stored layout over the defaults field by field.
 * That is correct while the frame is stable, and catastrophic across a redesign
 * — B56.0 moved the content box, the watermark, the badge and the plate, and
 * every one of the twelve stored layouts still carried the OLD values. So the
 * redesign applied only to card kinds nobody had ever tuned, and an admin had
 * tuned all twelve. The challenge card shipped to fifteen servers with its
 * content crammed into 59.5% of the width, the gradient bar back on, and the
 * watermark at 30% opacity in the corner.
 *
 * The near miss that should have caught it: `bar` below already carries a
 * comment saying stored layouts predate the redesign. The staleness was spotted
 * for ONE field and the obvious next question — what about `content`, `mark`,
 * `badge`, `plate`? — was never asked.
 *
 * A stored layout whose `v` is missing or older is IGNORED, not migrated: the
 * old numbers describe a frame that no longer exists, so there is nothing in
 * them worth carrying forward. The row is left alone rather than deleted, so a
 * previous tuning can still be read out of the database if anybody wants it,
 * and no production write is needed to recover — this ships by deploying.
 */
export const LAYOUT_VERSION = 2;

export type CardLayout = {
  /** Schema version. See LAYOUT_VERSION. */
  v?: number;
  /** The astronaut mascot. */
  mascot: Spot;
  /**
   * The GAME's logo, drawn faint in the top strip (B54).
   *
   * Decoration, not furniture: it says which game this card is about at a
   * glance, behind the identity line rather than beside it, so the strip reads
   * as that game's card without spending a slot the content needs. Drawn under
   * everything, at `opacity` — the house default is faint on purpose.
   *
   * Skipped when the badge is already showing the same logo, because two of one
   * mark in one band is a mistake rather than a design.
   */
  gameMark: Spot;
  /** The Cluster logo mark. */
  mark: Spot;
  /** Top-right furniture: game logo, level pill, or the challenge trophy stack. */
  badge: Spot;
  /**
   * The sponsor box.
   *
   * Every card the bot renders carries one, because the cards ARE the inventory:
   * a brand cannot buy a banner inside Discord, and this is the only surface
   * that reaches a server's members where they already are. `size` is the box
   * WIDTH in canvas pixels; its height follows `AD_RATIO`, so the geometry can't
   * drift from the creative a brand actually uploaded.
   *
   * Hide it per card kind (`hidden: true`) when a card shouldn't sell — a guide
   * that ships in the install flow, say — and every other card keeps earning.
   */
  ad: Spot;
  /**
   * What the top-right badge SHOWS on this card kind.
   *
   * Each card body used to decide this for itself — a level pill on a profile,
   * a game logo on a planet, the trophy row on a challenge — which meant the
   * one piece of furniture an admin can move was the one whose contents they
   * could not choose. On some cards the right answer is the game's logo; on
   * others it is nothing at all, because the art already carries it.
   *
   * "auto" keeps whatever the card decided, so this changes nothing until
   * somebody sets it.
   */
  badgeShow?: BadgeShow;
  content: ContentBox;
  /**
   * A thin line around the whole card, 0-100. 0 turns it off.
   *
   * The replacement for the gradient rule that used to run across the top: that
   * read as a notification banner, and what a section actually needs is an edge
   * so it stops being a rectangle of art with words on it. One quiet line, not
   * a light.
   */
  stroke?: number;
  /**
   * How the body is divided (B57).
   *
   * B56.0 made the body free space edge to edge, and one block of content
   * spread across 1100px is not a layout — it is a wide list. A body is PANES,
   * side by side rather than stacked: one where the card has one thing to say,
   * two where it has two (a profile's accounts and its trophy case), four where
   * it has four (the planet card — two ladders, the live challenges, the game
   * world; the planet explorer, rendered).
   *
   * Part of the layout rather than of the code, so an admin sets it per kind.
   * A card with nothing for a pane leaves it EMPTY — never a box with nothing
   * in it, which is the failure mode a grid invites.
   */
  /**
   * WHERE each pane pulls its content from (B58), keyed by part.
   *
   * Stored with the layout because it is the same decision, made in the same
   * screen, about the same card — and because `parseLayout` already round-trips
   * everything through one validator, which is what keeps admin input off
   * Satori.
   */
  refs?: Record<string, { source: string; ids?: string[] }>;
  bodyCols?: 1 | 2;
  bodyRows?: 1 | 2;
  /** The gap between panes, in canvas pixels. */
  gutter?: number;
  /** Darkness (0-100) of the plate drawn behind text blocks. 0 turns it off. */
  plate: number;
  /** Corner radius of that plate, in canvas pixels. */
  plateRadius: number;
  /** Strength (0-100) of the flat veil over the background art. */
  dim: number;
  /** The two big blurred accent circles in opposite corners. */
  glows: boolean;
  /** The gradient strip along the top edge. */
  bar: boolean;
  /** The directional scrims that darken the left column and bottom strip. */
  scrim: boolean;
  /** Per-part visibility and sizing, keyed by the kind's own region keys. */
  parts: Record<string, PartStyle>;
  /** Extra art placed on this card by an admin. */
  assets: CardAsset[];
  /**
   * Where this card's background comes from, in order of preference.
   *
   * Each entry is a source id from `BG_SOURCES` — `challenge.cover`,
   * `game.planetBg`, `gamer.background`, `card.bg` (the admin art for this card
   * kind), or `none`. The first one that resolves to a real image wins, which
   * is how "challenges use the challenge cover, planets use the planet globe"
   * stops being hard-coded in the data loader and becomes a setting.
   *
   * Empty means "whatever the loader chose", i.e. the behaviour before this
   * existed — so an unedited card is unchanged.
   */
  bgSources: string[];
};

// The house default — the geometry the renderer drew before any of this was
// editable, expressed in the new terms. Changing these changes every card that
// has never been edited, which is the point: one place to retune the whole set.
/**
 * Height / width of a sponsor creative.
 *
 * 0.3125 is the 320x100 mobile-leaderboard ratio — the single most common
 * banner a brand already owns, so the first campaign needs no new artwork. The
 * `discord_card` placement is defined at 640x200 (the same ratio at 2x) so what
 * a brand uploads lands in this box without a crop.
 */
export const AD_RATIO = 0.3125;

/** The "Sponsored · Brand" strip drawn under the creative, in canvas pixels. */
export const AD_LABEL_H = 22;

// THE SHARED CARD LAYOUT (B56.0).
//
// A card is a SECTION of the platform rendered to PNG, and a section has three
// bands and no furniture floating in the middle of it:
//
//   TOP-LEFT     the card's identity: an IMAGE — the game's logo, the gamer's
//                avatar, the game account's avatar, the quest's art — with the
//                title and one line of context beside it. Never text alone;
//                every kind has a picture of the thing it is about and a card
//                that opens with a headline in space could be any card.
//   TOP-RIGHT    the ad. FIXED, on every card, without exception. There is no
//                "unsold": when no brand has bought the slot the house creative
//                fills it, because the slot is the product and an empty corner
//                teaches a server owner that the bot sometimes has one.
//   EVERYTHING   free space, edge to edge. Nothing is drawn into the body that
//   BELOW        the body has to lay itself out around — no mascot in the
//                bottom-right, no logo tile in a corner, no badge hanging off
//                the strip. The Cluster mark is in this band and is a WATERMARK
//                behind the content, so it brands the card without taking a
//                rectangle from it.
//
// What that replaced, and why each went:
//
//   the gradient bar    A glowing rule across the top made every card look like
//                       a notification. A section has a border, not a light.
//                       `stroke` is the replacement: one thin, quiet line.
//   the corner mark     Our logo sat between the identity and the ad and was
//                       the third thing competing for a band that has room for
//                       two. It is the watermark now.
//   the mascot          It had been in three places in three commits — bottom
//                       left (behind the body text), the strip (through the
//                       title), then the right column (taking a column the body
//                       now needs). The body is free space; the mascot is not
//                       part of it.
//   the badge           A fourth thing in the top band, on a band with an ad in
//                       it. Off by default; a card that wants a level or a
//                       trophy row draws it in its own body, where it belongs.
export const DEFAULT_LAYOUT: CardLayout = {
  v: LAYOUT_VERSION,
  // OFF by default. The body is free space edge to edge, and a figure standing
  // in it is exactly the thing that stops a card being laid out properly. An
  // admin who wants it on a particular kind can unhide and place it.
  mascot: { x: 90, y: 76, size: 190, hidden: true },
  // THE IDENTITY IMAGE, top-left — the picture of whatever this card is about.
  // (Stored under its old key so no admin's saved placement is lost; it used to
  // be a faint watermark of the game's logo in the same corner.)
  gameMark: { x: 8.2, y: 17.5, size: 108 },
  // THE WATERMARK, in the body band, behind the content.
  //
  // It has been bottom-right (over the standings), then top-right in the strip
  // (under the sponsor box, which is drawn last, so on a sold card it was not
  // on the card at all). Both were attempts to give our mark a rectangle of its
  // own on a card that has no spare rectangle. As a watermark it costs nothing:
  // it is behind every word, it survives the crop, and no body has to lay
  // itself out around it.
  mark: { x: 50, y: 63, size: 430, opacity: 7 },
  // OFF by default — see the note above. Unhide it per kind if a card wants it.
  badge: { x: 91, y: 26, size: 96, hidden: true },
  // The whole band below the strip, edge to edge. Not a column any more: there
  // is nothing to its right to stop for, which is the entire point of moving
  // the mark, the mascot and the badge out of the body.
  content: { x: 4, y: 30.2, w: 92, h: 65 },
  // TOP-RIGHT, fixed, on every card. 400 wide: `adBox` gives it 125 of creative
  // plus the disclosure strip, so it bottoms out at 179 and the body starts
  // under it. Everything else in the top band is placed around this, because
  // this is the one element whose position is a commercial promise.
  ad: { x: 79.3, y: 15, size: 400 },
  plate: 46,
  plateRadius: 22,
  dim: 62,
  glows: false,
  // The gradient rule is GONE (B56.0) — see the note above. `bar` survives so
  // an admin who wants it can turn it back on, and so no stored layout breaks.
  bar: false,
  // A single thin line around the card, at this opacity. 0 turns it off.
  stroke: 26,
  // One pane by default: a kind that has not been given a second thing to say
  // should not be handed a second column to fill.
  bodyCols: 1,
  bodyRows: 1,
  gutter: 26,
  scrim: true,
  badgeShow: "auto",
  parts: {},
  assets: [],
  bgSources: [],
};

/**
 * Every place a card can take its background art from.
 *
 * `resolve` runs in the data loader with whatever that card knows about, so a
 * source that doesn't apply to a kind simply yields nothing and the next one is
 * tried. Listed in the editor as a drag-ordered preference list.
 */
export const BG_SOURCES: { id: string; label: string; note: string }[] = [
  { id: "entity.cover", label: "This thing's own cover", note: "The challenge's cover, the game's cover, the quest's card art — whatever the card is ABOUT." },
  // B85.2: relabelled. It only ever resolved the SPACE BACKGROUND, while the
  // label promised "the globe/space art" — which is how a card called "planet"
  // shipped with no planet on it and nobody could tell from the editor. The
  // globe is a subject, not a backdrop, and it now rides on the identity.
  { id: "game.planetBg", label: "The game's space backdrop", note: "The starfield behind the game's planet. A backdrop — the globe itself is drawn as the card's subject, not as art behind the text." },
  { id: "game.cover", label: "The game's cover", note: "The game's key art from the catalogue." },
  { id: "gamer.background", label: "The gamer's own art", note: "Their profile background, then their banner. Only on cards about a person." },
  { id: "card.bg", label: "Admin art for this card type", note: "What's set in Admin → Card backgrounds for this kind." },
  { id: "custom", label: "A fixed image", note: "One image you upload here, used on every card of this kind." },
  { id: "none", label: "No art (flat)", note: "Solid colour. Fastest, and sometimes the most readable." },
];

export const BG_SOURCE_IDS = new Set(BG_SOURCES.map((s) => s.id));

/**
 * Where a placed image can take its picture from, per card.
 *
 * These make a placed image a SLOT rather than a picture: the frame, the size
 * and the position are the admin's, and what appears inside it is whatever the
 * card is about. That is the difference between "the splash goes on the right"
 * as a rule and as a one-off.
 */
export const ASSET_SOURCES: { id: string; label: string; note: string }[] = [
  { id: "fixed", label: "A fixed image", note: "The one you pick. The same picture on every card of this kind." },
  { id: "self.art", label: "This thing's own image", note: "The champion's splash, the challenge cover, the quest map — whatever the card is ABOUT. Changes with every card." },
  { id: "self.logo", label: "The game's logo", note: "The logo of the game this card belongs to." },
  { id: "self.avatar", label: "The gamer's avatar", note: "Only on cards about a person." },
  { id: "self.trophy", label: "The top trophy", note: "The first trophy on the card — a challenge's winner prize, a profile's best." },
];

export const ASSET_SOURCE_IDS = new Set(ASSET_SOURCES.map((s) => s.id));

/** What the top-right badge can be told to show. */
export type BadgeShow = "auto" | "game" | "level" | "trophy" | "none";

export const BADGE_SHOWS: { id: BadgeShow; label: string; note: string }[] = [
  { id: "auto", label: "Whatever suits the card", note: "The level pill on a profile, the game's logo on a planet, the trophy row on a challenge. The default, and right most of the time." },
  { id: "game", label: "The game's logo", note: "Always the logo of the game this card belongs to. Nothing on a card with no game." },
  { id: "level", label: "The gamer's level", note: "A level pill. Nothing on a card that isn't about a person." },
  { id: "trophy", label: "The prize", note: "The trophy being competed for. Nothing where there isn't one." },
  { id: "none", label: "Nothing", note: "Leaves the corner empty — the right answer when the artwork already fills it." },
];

export const BADGE_SHOW_IDS = new Set(BADGE_SHOWS.map((b) => b.id));

export const LAYOUT_KINDS: CardKind[] = [
  "profile", "game-stats", "challenge", "leaderboard",
  "planet", "planets", "quest", "cp-summary", "guide", "week", "market", "world", "search",
];

export const layoutKey = (kind: string) => `card.layout.${kind}`;

// ===== Reading =====

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function spot(v: unknown, fallback: Spot): Spot {
  const o = (v ?? {}) as Partial<Spot>;
  return {
    x: num(o.x, fallback.x, -20, 120),
    y: num(o.y, fallback.y, -20, 120),
    // Capped well below the canvas: a mascot scaled to 2000px doesn't fail, it
    // just silently eats the whole card, which looks like a broken renderer.
    size: num(o.size, fallback.size, 24, 620),
    hidden: o.hidden === true,
    flipX: o.flipX === true,
    flipY: o.flipY === true,
    rotate: num(o.rotate, 0, -180, 180),
    opacity: num(o.opacity, 100, 0, 100),
  };
}

function parts(v: unknown): Record<string, PartStyle> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, PartStyle> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    // Keys are region ids from the card guide — short, known-shaped strings.
    if (!/^[a-z0-9_-]{1,40}$/i.test(k)) continue;
    const p = (raw ?? {}) as Partial<PartStyle>;
    const text = typeof p.text === "string" ? p.text.trim().slice(0, 160) : "";
    out[k] = {
      hidden: p.hidden === true,
      scale: num(p.scale, 1, 0.5, 2),
      opacity: num(p.opacity, 100, 0, 100),
      // Plain text only, and only ever drawn as a string by Satori — but it
      // also reaches the editor's DOM preview, so the tag characters go.
      ...(text ? { text: text.replace(/[<>]/g, "") } : {}),
      // Geometry. Clamped hard, because these reach Satori as CSS: a width of
      // 4000% or a margin of -1e9 is not a broken layout, it is a card that
      // fails to render at all and a bot reply that never arrives.
      ...(Number.isFinite(Number(p.dx)) && Number(p.dx) !== 0 ? { dx: num(p.dx, 0, -600, 600) } : {}),
      ...(Number.isFinite(Number(p.dy)) && Number(p.dy) !== 0 ? { dy: num(p.dy, 0, -400, 400) } : {}),
      ...(Number.isFinite(Number(p.w)) && Number(p.w) > 0 ? { w: num(p.w, 100, 5, 100) } : {}),
      ...(Number.isFinite(Number(p.order)) ? { order: num(p.order, 0, -50, 50) } : {}),
    };
  }
  return out;
}

function assets(v: unknown): CardAsset[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 12) // A card is 1200x630; a dozen extra images is already a lot.
    .map((raw, i): CardAsset | null => {
      const a = (raw ?? {}) as Partial<CardAsset>;
      const url = typeof a.url === "string" ? a.url.trim() : "";
      const source = typeof a.source === "string" && ASSET_SOURCE_IDS.has(a.source) ? a.source : "fixed";
      const validUrl = !!url && (/^https?:\/\//i.test(url) || url.startsWith("/") || url.startsWith("data:image/"));
      // Only real image sources. An admin-supplied `javascript:` would go
      // nowhere in Satori, but it would ship into the editor's DOM preview.
      //
      // A card-sourced slot is kept even with no fallback URL: its picture
      // comes from the card, and requiring a fixed image first would defeat
      // the point of it being a slot.
      if (!validUrl && source === "fixed") return null;
      return {
        id: typeof a.id === "string" && a.id ? a.id.slice(0, 40) : `a${i}`,
        url: validUrl ? url : "",
        ...(source !== "fixed" ? { source } : {}),
        x: num(a.x, 50, -20, 120),
        y: num(a.y, 50, -20, 120),
        w: num(a.w, 240, 16, 1400),
        ratio: num(a.ratio, 1, 0.05, 20),
        opacity: num(a.opacity, 100, 0, 100),
        flipX: a.flipX === true,
        flipY: a.flipY === true,
        rotate: num(a.rotate, 0, -180, 180),
        front: a.front === true,
      };
    })
    .filter((a): a is CardAsset => a !== null);
}

function bgSources(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of v) {
    if (typeof s !== "string" || !BG_SOURCE_IDS.has(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Parse whatever is stored into a layout that is always safe to render. */
export function parseLayout(raw: string | null | undefined, kind?: string): CardLayout {
  const kindPanes = (kind && KIND_PANES[kind]) || { cols: DEFAULT_LAYOUT.bodyCols ?? 1, rows: DEFAULT_LAYOUT.bodyRows ?? 1 };
  const fresh = () => ({ ...DEFAULT_LAYOUT, bodyCols: kindPanes.cols, bodyRows: kindPanes.rows });
  if (!raw) return fresh();
  let o: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fresh();
    o = parsed as Record<string, unknown>;
  } catch { return fresh(); }

  // A layout saved against an older frame is DISCARDED, not merged. See
  // LAYOUT_VERSION for what this cost. Merging stale geometry is worse than
  // ignoring it, because the result looks deliberate.
  if (Number(o.v) !== LAYOUT_VERSION) return fresh();

  const c = (o.content ?? {}) as Partial<ContentBox>;
  return {
    v: LAYOUT_VERSION,
    mascot: spot(o.mascot, DEFAULT_LAYOUT.mascot),
    gameMark: spot(o.gameMark, DEFAULT_LAYOUT.gameMark),
    mark: spot(o.mark, DEFAULT_LAYOUT.mark),
    badge: spot(o.badge, DEFAULT_LAYOUT.badge),
    ad: spot(o.ad, DEFAULT_LAYOUT.ad),
    content: {
      x: num(c.x, DEFAULT_LAYOUT.content.x, 0, 90),
      y: num(c.y, DEFAULT_LAYOUT.content.y, 0, 90),
      w: num(c.w, DEFAULT_LAYOUT.content.w, 10, 100),
      h: num(c.h, DEFAULT_LAYOUT.content.h, 10, 100),
    },
    plate: num(o.plate, DEFAULT_LAYOUT.plate, 0, 100),
    plateRadius: num(o.plateRadius, DEFAULT_LAYOUT.plateRadius, 0, 60),
    dim: num(o.dim, DEFAULT_LAYOUT.dim, 0, 100),
    glows: o.glows === true,
    // Defaults OFF now (B56.0): a stored layout that predates the redesign has
    // no `bar` key, and reviving the gradient rule for every one of them would
    // undo the redesign on exactly the cards an admin had already tuned.
    bar: o.bar === true,
    stroke: num(o.stroke, DEFAULT_LAYOUT.stroke ?? 0, 0, 100),
    bodyCols: (num(o.bodyCols, kindPanes.cols, 1, 2) === 2 ? 2 : 1) as 1 | 2,
    bodyRows: (num(o.bodyRows, kindPanes.rows, 1, 2) === 2 ? 2 : 1) as 1 | 2,
    gutter: num(o.gutter, DEFAULT_LAYOUT.gutter ?? 26, 0, 80),
    // Through B58's own parser: an unknown source falls back to the kind's
    // default rather than blanking the pane, and an id that is not id-shaped is
    // dropped rather than handed to a query.
    refs: parseRefs(o.refs, kind as never),
    scrim: o.scrim !== false,
    badgeShow: typeof o.badgeShow === "string" && BADGE_SHOW_IDS.has(o.badgeShow as BadgeShow)
      ? (o.badgeShow as BadgeShow) : "auto",
    parts: parts(o.parts),
    assets: assets(o.assets),
    bgSources: bgSources(o.bgSources),
  };
}

/**
 * How one named section of a card should be drawn.
 *
 * `f` is the whole reason `scale` is usable: every font size inside a section
 * goes through it, so "make the standings bigger" is one slider rather than a
 * redesign. `say` is the text override — hand it the section's built-in words
 * and it returns those words unless an admin replaced them.
 */
export type PartDraw = {
  hidden: boolean;
  scale: number;
  opacity: number;
  text?: string;
  /** Nudge from where the flow put this section, in canvas pixels. */
  dx: number;
  dy: number;
  /** This section's own width as a % of the canvas, when it has one. */
  w?: number;
  /** Its place in the stack, when an admin has reordered it. */
  order?: number;
  /** A font size in canvas pixels, scaled by this section's setting. */
  f: (px: number) => number;
  /** This section's fixed copy, or the admin's replacement for it. */
  say: (built: string) => string;
  /** Offset/width/order as a style object for the section's own wrapper. */
  box: () => Record<string, string | number>;
};

/** How a part should be drawn, with the house default when it's unset. */
export function partOf(l: CardLayout, key: string): PartDraw {
  const p = l.parts?.[key];
  const scale = typeof p?.scale === "number" ? p.scale : 1;
  const text = typeof p?.text === "string" && p.text ? p.text : undefined;
  const dx = typeof p?.dx === "number" ? p.dx : 0;
  const dy = typeof p?.dy === "number" ? p.dy : 0;
  const w = typeof p?.w === "number" && p.w > 0 ? p.w : undefined;
  return {
    hidden: p?.hidden === true,
    scale,
    opacity: typeof p?.opacity === "number" ? p.opacity : 100,
    text,
    dx, dy, w,
    order: typeof p?.order === "number" ? p.order : undefined,
    f: (px: number) => Math.max(8, Math.round(px * scale)),
    say: (built: string) => text ?? built,
    /**
     * The style a section carries beyond its own contents.
     *
     * `marginLeft`/`marginTop` rather than `left`/`top`: the section stays in
     * the flex column (so hiding one still gives its space away) and simply
     * starts somewhere else. `position: relative` with offsets would leave a
     * hole where the block used to be, which is not what "move it" means.
     */
    box: () => {
      const s: Record<string, string | number> = {};
      if (dx) s.marginLeft = dx;
      if (dy) s.marginTop = dy;
      if (w) s.width = `${w}%`;
      if (typeof p?.order === "number") s.order = p.order;
      return s;
    },
  };
}

/**
 * Where each of a card's content sections is drawn, for the editor's canvas.
 *
 * The guide carries two lists and they are not the same list. `regions` are art
 * zones — "keep detail out of here" — and include the furniture (the mascot,
 * the logo, the sponsor box). `parts` are the blocks the renderer actually
 * draws. Some keys appear in both, most don't: a profile has regions for
 * `stats` and `accounts` and parts for `identity`, `trophies` and `challenges`
 * too. Joining the two by key drew boxes for two sections out of five and
 * silently dropped the rest, which is worse than drawing none — a canvas that
 * shows some of the card looks complete.
 *
 * So every part gets a box. A hand-tuned region wins where one exists, because
 * somebody measured it against the real render.
 *
 * ===== The part that had to be rewritten =====
 *
 * Everything without a region used to share the WHOLE content box, which meant
 * it was drawn straight on top of the sections that did have one — a headline
 * and a grid of game logos rendered in the same rectangle, unreadable, and
 * nothing like the card. Every one of the twelve kinds mixes the two, so this
 * was not an edge case; it was the canvas.
 *
 * Un-regioned sections now stack only in the vertical space the placed ones
 * leave free, in DRAW ORDER. Walk the parts as the renderer does: a placed
 * section takes its rectangle and pushes the cursor below it; a run of
 * un-regioned sections shares the band between the cursor and whatever is
 * placed next. That is exactly how a column of blocks around fixed elements
 * behaves, so the canvas stops being a diagram and starts being a preview.
 */
export function partBoxes(
  l: CardLayout,
  parts: { key: string; side?: boolean }[],
  regions: { key: string; x: number; y: number; w: number; h: number }[],
): Record<string, { x: number; y: number; w: number; h: number }> {
  const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
  const byKey = new Map(regions.map((r) => [r.key, r]));
  // A side section — the world card's splash banner — is not in the text
  // column and does not have a fixed home either: it hangs below the sponsor
  // box, wherever the sponsor box currently is. Drawing it stacked with the
  // paragraphs put the one element that moves with the ad in the one place it
  // never appears.
  const side = sideBox(l, { hasAd: !l.ad.hidden, hasBadge: false });
  const sideAsPct = {
    x: (side.left / CANVAS_W) * 100,
    y: (side.top / CANVAS_H) * 100,
    w: (side.width / CANVAS_W) * 100,
    h: (side.height / CANVAS_H) * 100,
  };

  // A gap between blocks so adjacent boxes are visibly separate rather than one
  // continuous column an admin cannot tell apart.
  const GAP = 0.8;
  const MIN_H = 4;
  const top = l.content.y;
  const bottom = l.content.y + l.content.h;

  // A placed region only pushes the stack down if it is actually IN the text
  // column. Several guides put a region beside it — the challenge card's trophy
  // strip runs down the right — and treating those as blockers shoved the whole
  // column into the bottom of the card for no reason. Half the column's width is
  // the test: sharing an edge is not being in the way.
  const blocks = (r: { x: number; w: number }) => {
    const overlap = Math.min(l.content.x + l.content.w, r.x + r.w) - Math.max(l.content.x, r.x);
    return overlap > l.content.w * 0.5;
  };

  type Slot = { key: string; region?: { x: number; y: number; w: number; h: number }; side?: boolean };
  const slots: Slot[] = parts.map((p) => ({
    key: p.key,
    side: p.side && sideBoxFits(side),
    region: byKey.get(p.key),
  }));

  let cursor = top;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot.side) { out[slot.key] = sideAsPct; continue; }
    if (slot.region) {
      out[slot.key] = { ...slot.region };
      // Only ever move DOWN: a region placed above the cursor (the guide is
      // free to order them however it likes) must not drag the stack back up
      // into sections already laid out.
      if (blocks(slot.region)) cursor = Math.max(cursor, slot.region.y + slot.region.h + GAP);
      continue;
    }

    // A run of un-regioned sections, sharing the band before the next thing
    // that is genuinely in their way. Collected per run rather than divided
    // globally, because the space available depends on what surrounds it.
    const run: number[] = [];
    let j = i;
    while (j < slots.length && !slots[j].region && !slots[j].side) { run.push(j); j++; }
    const next = slots.slice(j).find((sl) => sl.region && blocks(sl.region));
    const limit = next ? next.region!.y - GAP : bottom;
    // The band can be tighter than the minimum height would like. When it is,
    // the run SHRINKS to fit rather than overflowing into the section below —
    // an approximate box in the right place beats an exact one in the wrong one.
    const band = Math.max(1, limit - cursor);
    const each = Math.max(1, (band - GAP * (run.length - 1)) / run.length);

    run.forEach((idx, k) => {
      const y = cursor + k * (each + GAP);
      out[slots[idx].key] = {
        x: l.content.x,
        y,
        // Narrowed around anything sitting BESIDE it at the same height — the
        // game-account card's match strip, the challenge card's trophy column.
        // Those don't push the stack down, but they do take width away from it,
        // and a box drawn under one is a box in the wrong shape.
        w: narrowed(l, slots, byKey, blocks, y, each),
        h: each,
      };
    });
    cursor = cursor + run.length * (each + GAP);
    i = j - 1;
  }
  return out;
}

/** The column's usable width at a given height, once side-by-side regions take
 *  their share. Never narrower than a third, because a sliver is not a preview. */
function narrowed(
  l: CardLayout,
  slots: { key: string; region?: { x: number; y: number; w: number; h: number }; side?: boolean }[],
  byKey: Map<string, { x: number; y: number; w: number; h: number }>,
  blocks: (r: { x: number; w: number }) => boolean,
  y: number,
  h: number,
): number {
  let right = l.content.x + l.content.w;
  for (const s of slots) {
    const r = s.region;
    if (!r || blocks(r)) continue;
    // Same height band, and starts to the right of where the column begins.
    const sameBand = y < r.y + r.h && r.y < y + h;
    if (!sameBand || r.x <= l.content.x) continue;
    right = Math.min(right, r.x - 0.8);
  }
  void byKey;
  return Math.max(l.content.w / 3, right - l.content.x);
}

/** The CSS transform for a flipped/rotated element. Satori supports both. */
export function transformOf(o: { flipX?: boolean; flipY?: boolean; rotate?: number }): string | undefined {
  const parts: string[] = [];
  if (o.rotate) parts.push(`rotate(${o.rotate}deg)`);
  if (o.flipX || o.flipY) parts.push(`scale(${o.flipX ? -1 : 1}, ${o.flipY ? -1 : 1})`);
  return parts.length ? parts.join(" ") : undefined;
}

/** 0-100 as a CSS opacity, or undefined when it's fully opaque. */
export function opacityOf(v: number | undefined): number | undefined {
  return typeof v === "number" && v < 100 ? Math.max(0, v) / 100 : undefined;
}

/** Absolute pixel box for a placed asset, on the real 1200x630 canvas. */
export function assetBox(a: CardAsset): { left: number; top: number; width: number; height: number } {
  const width = a.w;
  const height = a.w * a.ratio;
  return {
    left: (a.x / 100) * CANVAS_W - width / 2,
    top: (a.y / 100) * CANVAS_H - height / 2,
    width,
    height,
  };
}

/**
 * The same box as percentages, for the editor's canvas.
 *
 * The editor's canvas is 1200x630 in PROPORTION but never in CSS pixels — it's
 * whatever width the admin's screen gives it. Positioning a placed image with
 * `assetBox`'s raw pixels there drew it at the wrong size on every screen
 * except a 1200px-wide one, so the canvas and the PNG disagreed about how big
 * an image was. Percentages of the canvas scale with it and agree everywhere,
 * which is exactly what `spotBox`'s callers already do for the furniture.
 */
export function assetBoxPct(a: CardAsset): { left: number; top: number; width: number; height: number } {
  const b = assetBox(a);
  return {
    left: (b.left / CANVAS_W) * 100,
    top: (b.top / CANVAS_H) * 100,
    width: (b.width / CANVAS_W) * 100,
    height: (b.height / CANVAS_H) * 100,
  };
}

/** A placed image's width as a % of the card, and back. The stored number is
 *  canvas pixels; every control that says "%" has to convert or it lies. */
export const assetWidthPct = (w: number) => (w / CANVAS_W) * 100;
export const assetWidthPx = (pct: number) => (pct / 100) * CANVAS_W;

// ===== Geometry helpers, shared by the renderer and the editor preview =====

/** Absolute pixel box for a spot whose art is `size` wide and `ratio` tall. */
export function spotBox(s: Spot, ratio = 1): { left: number; top: number; width: number; height: number } {
  const width = s.size;
  const height = s.size * ratio;
  return {
    left: (s.x / 100) * CANVAS_W - width / 2,
    top: (s.y / 100) * CANVAS_H - height / 2,
    width,
    height,
  };
}

/**
 * The whole sponsor unit: the creative plus the strip that names the brand.
 *
 * The spot positions the CREATIVE, so an admin dragging the box is dragging the
 * picture rather than a container whose height depends on whether a label
 * happens to fit.
 */
export function adBox(s: Spot): {
  left: number; top: number; width: number; height: number; imageHeight: number; bottom: number;
} {
  const b = spotBox(s, AD_RATIO);
  return { ...b, imageHeight: b.height, height: b.height + AD_LABEL_H, bottom: b.top + b.height + AD_LABEL_H };
}

/**
 * Where the badge actually hangs once a sponsor box is on the card.
 *
 * The brief was "put the ad top-right and move the badge and trophy below it".
 * Doing that by changing the badge's stored default would have moved it on
 * every card whether or not an ad was ever served, leaving a hole at the top of
 * an unsold card. So the shift is computed at render time and only when the two
 * genuinely collide: an admin who drags the badge somewhere else keeps exactly
 * where they put it, and a card with no ad is unchanged.
 */
export function badgeTopFor(l: CardLayout, hasAd: boolean, badgeRatio = 1): number {
  const badge = spotBox(l.badge, badgeRatio);
  if (!hasAd || l.ad.hidden || l.badge.hidden) return badge.top;
  const ad = adBox(l.ad);
  const overlapsX = badge.left < ad.left + ad.width && ad.left < badge.left + badge.width;
  const overlapsY = badge.top < ad.bottom && ad.top < badge.top + badge.height;
  if (!overlapsX || !overlapsY) return badge.top;
  // Never push the badge off the bottom edge; a clipped trophy stack is worse
  // than one that overlaps by a few pixels.
  return Math.min(ad.bottom + 16, CANVAS_H - badge.height - 8);
}

/**
 * Where our own mark actually hangs once a sponsor box is on the card.
 *
 * B54 moved the mark to the top-right strip (x 91.5, y 8.5 → 1032..1164 across,
 * -12..119 down). The default sponsor box is x 81.7, y 12.8, 400 wide, which
 * `adBox` puts at 780..1180 across and -24..208 down — so on every SOLD card the
 * ad was drawn last, over the top, and our mark was gone. Unsold cards looked
 * right, which is exactly the sort of thing that ships.
 *
 * Same treatment `badgeTopFor` gives the badge, in the other axis: the mark
 * slides LEFT to clear the creative rather than down, because the strip is the
 * band it belongs in and dropping it out of the strip is a different card. An
 * admin who has hand-placed either keeps their placement whenever the two do
 * not actually collide, and a card with no ad is untouched.
 */
export function markLeftFor(l: CardLayout, hasAd: boolean): number {
  const mark = spotBox(l.mark, 1);
  if (!hasAd || l.ad.hidden || l.mark.hidden) return mark.left;
  const ad = adBox(l.ad);
  const overlapsX = mark.left < ad.left + ad.width && ad.left < mark.left + mark.width;
  const overlapsY = mark.top < ad.bottom && ad.top < mark.top + mark.height;
  if (!overlapsX || !overlapsY) return mark.left;
  // Never push it off the left edge: a mark half off the canvas is worse than
  // one that shares a few pixels with the creative.
  return Math.max(8, ad.left - mark.width - 16);
}

const overlap = (a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number }) =>
  a.left < b.left + b.width && b.left < a.left + a.width
  && a.top < b.top + b.height && b.top < a.top + a.height;

/**
 * Does the mascot have to stand down on this card?
 *
 * The strip has three tenants and only two of them are load-bearing. On a SOLD
 * card the creative takes the right end and `markLeftFor` slides our mark left
 * to clear it — straight into where the mascot stands. The first render of that
 * was a grey shoulder poking out from behind the logo, which is worse than no
 * mascot at all.
 *
 * So it yields, and only when it actually collides: an unsold card keeps it, and
 * an admin who has dragged it somewhere the mark never reaches keeps it on every
 * card. Decoration gives way to the two things that are not.
 */
export function mascotYields(l: CardLayout, hasAd: boolean): boolean {
  if (l.mascot.hidden || l.mark.hidden || !hasAd || l.ad.hidden) return false;
  const mascot = spotBox(l.mascot, 1);
  const mark = { ...spotBox(l.mark, 1), left: markLeftFor(l, true) };
  return overlap(mascot, mark) || overlap(mascot, adBox(l.ad));
}

/**
 * The right-hand column, under the sponsor box.
 *
 * The world card's splash banner lives here, and where it lands is not a fixed
 * rectangle: it starts where the text column ends and drops below whichever of
 * the sponsor box and the badge hangs lowest, so dragging the ad drags the
 * splash with it. That made it invisible to the layout editor, which drew the
 * splash at the card guide's static home geometry — the one element on the
 * canvas that was in the wrong place by design.
 *
 * Shared, so "below the ad box" means the same rectangle in the editor and in
 * the PNG.
 */
export function sideBox(l: CardLayout, o: { hasAd: boolean; hasBadge: boolean; badgeRatio?: number }): {
  left: number; top: number; width: number; height: number;
} {
  const content = contentBox(l.content);
  const badge = spotBox(l.badge, o.badgeRatio ?? 1);
  const top = Math.max(
    content.top,
    o.hasAd && !l.ad.hidden ? adBox(l.ad).bottom + 14 : 0,
    o.hasBadge && !l.badge.hidden ? badgeTopFor(l, o.hasAd, o.badgeRatio ?? 1) + badge.height + 14 : 0,
  );
  const left = content.left + content.width + 16;
  return {
    left,
    top,
    width: Math.max(0, CANVAS_W - 20 - left),
    height: Math.max(0, CANVAS_H - 18 - top),
  };
}

/** True when that column is big enough to be worth drawing at all. */
export const sideBoxFits = (b: { width: number; height: number }) => b.width > 60 && b.height > 60;

/**
 * The content box, narrowed if a sponsor box is standing in it.
 *
 * B54 widened the column from 58.5% to 78% and started it at the top of the
 * card, which is right for the card a server actually sees most of the time —
 * an UNSOLD one. On a sold card the same geometry ran the title straight under
 * the creative: "Blitz Supernova — Weekly Wins Ra…" with the last word behind
 * our own logo, and the description sliced off mid-sentence by the ad's edge.
 *
 * Satori has no float, so the text cannot wrap around the creative; the column
 * has to end before it. The old layout paid that cost on every card forever by
 * keeping the column narrow whether or not anything was ever sold. This pays it
 * only when there is something to pay it for.
 *
 * Height and top are untouched — only the width moves, so nothing reflows
 * vertically and a card that fitted still fits.
 */
export function contentBoxFor(l: CardLayout, hasAd: boolean) {
  const box = contentBox(l.content);
  if (!hasAd || l.ad.hidden) return box;
  const ad = adBox(l.ad);
  // The obstacle is not just the creative: the mark slides LEFT of it on a sold
  // card (see `markLeftFor`), which put our own logo inside the text column —
  // the second render of this had "Weekly Wins" running behind the mark. The
  // column ends before the right-hand furniture, whichever piece of it comes
  // first.
  const wall = l.mark.hidden ? ad.left : Math.min(ad.left, markLeftFor(l, true));
  const overlapsY = box.top < ad.bottom && ad.top < box.top + box.height;
  if (!overlapsY || box.left + box.width <= wall) return box;
  // Never narrower than a third of the canvas: a column squeezed to nothing by
  // an admin who dragged the ad across the card is an unreadable card, and the
  // creative overlapping some text is the lesser of those two.
  return { ...box, width: Math.max(CANVAS_W / 3, wall - 16 - box.left) };
}

/**
 * The rectangle of each body pane (B57).
 *
 * ONE helper, shared by the renderer and the layout editor, for the same reason
 * `sideBox` is shared: a pane the editor draws in a different place from where
 * the renderer draws it is worse than no editor at all.
 *
 * Returns as many rectangles as the layout asks for, reading order — left to
 * right, then top to bottom. A card hands its panes in the same order and the
 * ones it has no content for are simply not drawn.
 */
/**
 * How many panes each kind's body wants, before an admin says otherwise (B57).
 *
 * A default rather than a rule: it is the shape the card was designed to, and
 * `parseLayout` lets a stored layout override it like any other field. Kinds
 * not listed here get one pane, which is the right answer for a leaderboard —
 * a second column of nothing is worse than a wide list.
 */
export const KIND_PANES: Record<string, { cols: 1 | 2; rows: 1 | 2 }> = {
  // Accounts on the left, the trophy case on the right.
  profile: { cols: 2, rows: 1 },
  // Details and prize on the left, so the standings get the right-hand column
  // back — they were being squeezed by a podium drawn above them.
  challenge: { cols: 2, rows: 1 },
  // THE 2x2. Two ladders, the live challenges and the game world: the planet
  // explorer, rendered.
  planet: { cols: 2, rows: 2 },
  // Mains and recent matches, side by side, the way the account page reads.
  "game-stats": { cols: 2, rows: 1 },
};

export function panes(l: CardLayout): { left: number; top: number; width: number; height: number }[] {
  const box = contentBox(l.content);
  const cols = l.bodyCols === 2 ? 2 : 1;
  const rows = l.bodyRows === 2 ? 2 : 1;
  const g = Math.max(0, l.gutter ?? 26);
  const w = (box.width - g * (cols - 1)) / cols;
  const h = (box.height - g * (rows - 1)) / rows;
  const out: { left: number; top: number; width: number; height: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ left: box.left + c * (w + g), top: box.top + r * (h + g), width: w, height: h });
    }
  }
  return out;
}

export function contentBox(c: ContentBox): { left: number; top: number; width: number; height: number } {
  return {
    left: (c.x / 100) * CANVAS_W,
    top: (c.y / 100) * CANVAS_H,
    width: (c.w / 100) * CANVAS_W,
    height: (c.h / 100) * CANVAS_H,
  };
}

/** The dark plate behind a text block, as a CSS colour. Empty when off. */
export function plateBg(l: CardLayout): string {
  return l.plate > 0 ? `rgba(4,5,26,${(l.plate / 100).toFixed(3)})` : "transparent";
}
