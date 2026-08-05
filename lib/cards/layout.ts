import type { CardKind } from "@/lib/cards/types";

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

export type CardLayout = {
  /** The astronaut mascot. */
  mascot: Spot;
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

export const DEFAULT_LAYOUT: CardLayout = {
  mascot: { x: 9, y: 84, size: 200 },
  // Bottom-right at 250, on every card, without exception.
  //
  // It was 104px and it read as a favicon somebody forgot to remove. These
  // cards get screenshotted, cropped and reposted, and the only thing that
  // travels with them is this mark — so it is drawn at a size that survives
  // being seen at thumbnail scale in somebody else's feed.
  // TOP-RIGHT (B54). It sat bottom-right at y:77.5, which put our mark in the
  // busiest part of most cards — under the standings, over the prize art — and
  // meant a card cropped for a tweet lost the branding first. The strip along
  // the top is the one band every card keeps free by construction, so branding
  // goes there, on the right, with the card's own identity on the left.
  //
  // An admin who has hand-placed the mark keeps their placement: this is the
  // DEFAULT, and `spot()` only falls back to it for an unset value.
  mark: { x: 91.5, y: 8.5, size: 132 },
  // Pushed below the strip, since the mark now owns the top-right corner.
  badge: { x: 91, y: 26, size: 96 },
  // The text column stops short of the sponsor box AND of the logo.
  //
  // Satori has no float, so text cannot wrap around either of them — the
  // column has to end before the right-hand furniture starts. 758px of the
  // 1200 belongs to content; the 420 to its right belongs to the brand at the
  // top, the logo at the bottom, and (on a world card) the splash between.
  // This is the cost of carrying inventory on every card, taken once, in one
  // place, instead of discovered per card in production.
  // Starts under the strip, and now uses the WIDTH the mark gave up.
  //
  // 58.5% was the right number when the logo sat bottom-right and the ad sat
  // top-right: the column had to end before both. With branding in the strip,
  // the only thing still reserved on the right is the ad — and an unsold card
  // has nothing there at all, which is why the first render after moving the
  // mark had a dead half. `sideBox` still hands the world card its splash
  // rectangle from the live layout, so widening here narrows that automatically
  // rather than letting the two overlap.
  content: { x: 4.7, y: 15, w: 78, h: 76 },
  // Top-right corner at 400 wide — the biggest unit that still leaves a
  // readable text column, and the same coordinates on every card so a brand's
  // creative lands in the same place whatever the bot was asked for. The badge
  // is pushed clear of it automatically; see `badgeTopFor`.
  ad: { x: 81.7, y: 12.8, size: 400 },
  plate: 46,
  plateRadius: 22,
  dim: 62,
  glows: false,
  bar: true,
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
  { id: "game.planetBg", label: "The game's planet art", note: "The globe/space art from the game's planet. The natural backdrop for anything game-shaped." },
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
export function parseLayout(raw: string | null | undefined): CardLayout {
  if (!raw) return DEFAULT_LAYOUT;
  let o: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_LAYOUT;
    o = parsed as Record<string, unknown>;
  } catch { return DEFAULT_LAYOUT; }

  const c = (o.content ?? {}) as Partial<ContentBox>;
  return {
    mascot: spot(o.mascot, DEFAULT_LAYOUT.mascot),
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
    bar: o.bar !== false,
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
