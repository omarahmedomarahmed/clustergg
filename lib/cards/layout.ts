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

/** An element that can be dragged and resized. */
export type Spot = {
  /** Centre of the element, as a % of canvas width/height. */
  x: number;
  y: number;
  /** Rendered size in canvas pixels (width for images, the box for the badge). */
  size: number;
  hidden?: boolean;
};

/** The block the card's own content is drawn into. Percentages, edges. */
export type ContentBox = { x: number; y: number; w: number; h: number };

export type CardLayout = {
  /** The astronaut mascot. */
  mascot: Spot;
  /** The Cluster logo mark. */
  mark: Spot;
  /** Top-right furniture: game logo, level pill, or the challenge trophy stack. */
  badge: Spot;
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
};

// The house default — the geometry the renderer drew before any of this was
// editable, expressed in the new terms. Changing these changes every card that
// has never been edited, which is the point: one place to retune the whole set.
export const DEFAULT_LAYOUT: CardLayout = {
  mascot: { x: 9, y: 84, size: 200 },
  mark: { x: 92.7, y: 87.6, size: 104 },
  badge: { x: 91, y: 11.5, size: 96 },
  content: { x: 4.7, y: 7, w: 79.5, h: 84 },
  plate: 46,
  plateRadius: 22,
  dim: 62,
  glows: false,
  bar: true,
  scrim: true,
};

export const LAYOUT_KINDS: CardKind[] = [
  "profile", "game-stats", "challenge", "leaderboard",
  "planet", "planets", "quest", "cp-summary", "guide",
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
  };
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
