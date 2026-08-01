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
  mark: { x: 87.5, y: 77.5, size: 250 },
  badge: { x: 91, y: 11.5, size: 96 },
  // The text column stops short of the sponsor box AND of the logo.
  //
  // Satori has no float, so text cannot wrap around either of them — the
  // column has to end before the right-hand furniture starts. 758px of the
  // 1200 belongs to content; the 420 to its right belongs to the brand at the
  // top, the logo at the bottom, and (on a world card) the splash between.
  // This is the cost of carrying inventory on every card, taken once, in one
  // place, instead of discovered per card in production.
  content: { x: 4.7, y: 7, w: 58.5, h: 84 },
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

export const LAYOUT_KINDS: CardKind[] = [
  "profile", "game-stats", "challenge", "leaderboard",
  "planet", "planets", "quest", "cp-summary", "guide", "week", "world", "search",
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
      // Only real image sources. An admin-supplied `javascript:` would go
      // nowhere in Satori, but it would ship into the editor's DOM preview.
      if (!url || !(/^https?:\/\//i.test(url) || url.startsWith("/") || url.startsWith("data:image/"))) return null;
      return {
        id: typeof a.id === "string" && a.id ? a.id.slice(0, 40) : `a${i}`,
        url,
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
  /** A font size in canvas pixels, scaled by this section's setting. */
  f: (px: number) => number;
  /** This section's fixed copy, or the admin's replacement for it. */
  say: (built: string) => string;
};

/** How a part should be drawn, with the house default when it's unset. */
export function partOf(l: CardLayout, key: string): PartDraw {
  const p = l.parts?.[key];
  const scale = typeof p?.scale === "number" ? p.scale : 1;
  const text = typeof p?.text === "string" && p.text ? p.text : undefined;
  return {
    hidden: p?.hidden === true,
    scale,
    opacity: typeof p?.opacity === "number" ? p.opacity : 100,
    text,
    f: (px: number) => Math.max(8, Math.round(px * scale)),
    say: (built: string) => text ?? built,
  };
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

/** Absolute pixel box for a placed asset. */
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
