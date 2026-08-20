// The gamer profile customization engine.
//
// Ported from `ported-design/theme.ts` — the v1 platform's, carried deliberately
// with a written reason, because v3 shipped no profile customization at all and
// rebuilding a finished, shipped design from nothing would be inventing a second
// answer to a question already answered.
//
// A theme is a small JSON blob the gamer edits in the builder. It renders to
// CSS variables on a scoped root element (D17) and every field degrades to a
// default (D16/E18) — which is what makes the engine safe to extend.
//
// ===== WHAT WAS CHANGED ON ARRIVAL, AND WHY =====
//
// `ported-design/README.md` lists five. Two of them are this file's:
//
//   1. **`SECTIONS` was v1's.** `quests`, `badges`, `activity` ("recent posts")
//      and `spaces` ("my planets") describe surfaces v3 deleted on purpose.
//      The section *model* is right and the sections are not, so they are D21's
//      now: linked accounts, trophy case, challenges entered, standings, rank
//      history. Carrying the old keys would have put quests back into the
//      product through the door nobody watches — a gamer's saved `order` would
//      have named them, and the builder would have offered them.
//
//   5. **`--font-grotesk` expects a font v3 does not load.** A missing display
//      font degrades silently to system sans, which is exactly the failure trap
//      31 describes: it looks like a choice. Sprint 17 is the design pass, so
//      the decision taken here is to **replace the stack** rather than load a
//      font this sprint — `display` names real faces that exist on the devices
//      gamers use, and nothing points at a variable nobody defines.
//
// The other three are `globals.css`'s and are recorded in `docs/PLAN.md` §2.0
// with the decision, per the README's instruction to *decide, and write down
// which*.
//
// ===== D20 — READ FORGIVINGLY, NEVER DISCARD ON A VERSION MISMATCH =====
//
// The version stamp exists so the **next** redesign can decide field by field,
// not so this one can throw anything away. These are a gamer's own choices:
// somebody picked that background. Discarding it because we redesigned would be
// breaking their page to tidy our code.

import type { CSSProperties } from "react";

export type AvatarShape =
  | "circle"
  | "rounded"
  | "square"
  | "hexagon"
  | "heart"
  | "star"
  | "lightning";

export const AVATAR_SHAPES: AvatarShape[] = [
  "circle",
  "rounded",
  "square",
  "hexagon",
  "heart",
  "star",
  "lightning",
];

export type ProfileTheme = {
  /** Schema version. Stamped on read, never used to discard (D20). */
  v?: number;
  template: string;
  mode: "dark" | "light";
  bg: string;
  bgImage: string | null;
  bgBlur: number;
  bgOverlay: number;
  panel: string;
  accent: string;
  accent2: string;
  text: string;
  muted: string;
  cardStyle: "glass" | "solid" | "outline" | "flat";
  buttonStyle: "neon" | "solid" | "outline" | "glass" | "pill";
  font: string;
  radius: number;
  cursor: string;
  cursorColor: string;
  coverUrl: string | null;
  coverHeight: number;
  coverOverlay: number;
  avatarShape: AvatarShape;
  avatarSize: number;
  sections: Record<string, boolean>;
  order: string[];
  sectionArt: Record<string, string>;
};

/** Scalable clip-paths, in % so they resize with the avatar. */
const CLIP: Partial<Record<AvatarShape, string>> = {
  heart:
    "polygon(50% 100%, 14% 66%, 0% 38%, 8% 16%, 30% 10%, 50% 27%, 70% 10%, 92% 16%, 100% 38%, 86% 66%)",
  star: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
  lightning: "polygon(52% 0%, 18% 56%, 44% 56%, 28% 100%, 84% 40%, 52% 40%)",
  hexagon: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
};

export function avatarClip(shape: AvatarShape): string | undefined {
  return CLIP[shape];
}

/**
 * **D21 — the sections are v3's, not v1's.**
 *
 * The list this replaced was `accounts · quests & Cluster Points · standings ·
 * trophies · badges · challenges · recent posts · my planets`. Four of those
 * eight name things v3 deleted, and a gamer's saved `order` naming `quests`
 * would have been the deleted product finding its way back through storage.
 */
export const SECTIONS = [
  { key: "accounts", label: "Linked accounts" },
  { key: "trophies", label: "Trophy case" },
  { key: "challenges", label: "Challenges entered" },
  { key: "standings", label: "Standings" },
  { key: "rank", label: "Rank history" },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];

/**
 * The font stacks.
 *
 * `grotesk` used to be `var(--font-grotesk), …` and v3 loads no such font, so
 * every gamer who picked it silently got system sans — README change 5, and
 * trap 31's exact shape: a default that looks like a decision. Renamed and
 * given faces that exist. When Sprint 17's design pass loads a real display
 * font, this is the one line that changes.
 */
export const FONTS: Record<string, string> = {
  display: "'Segoe UI', 'Helvetica Neue', Arial, system-ui, sans-serif",
  system: "system-ui, -apple-system, sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
  serif: "Georgia, 'Times New Roman', serif",
  round: "'Trebuchet MS', 'Segoe UI', sans-serif",
};

export const CURSOR_KEYS = [
  "default",
  "crosshair",
  "spark",
  "ring",
  "arrow",
  "gamepad",
  "dot",
  "sword",
];

const enc = (c: string) => c.replace("#", "%23");

/** The CSS `cursor` value for a preset, in the chosen colour. */
export function cursorValue(key: string, color = "#22d3ee"): string {
  if (!key || key === "default") return "auto";
  if (key === "crosshair") return "crosshair";
  // ===== A CUSTOM CURSOR IS A URL A GAMER TYPED =====
  //
  // v1 accepted anything starting with `http`. That is a gamer-supplied string
  // going into a CSS `url()` on a public page, so it is bounded here: https
  // only, and no quote or parenthesis can survive into the value. A `"` in the
  // middle of `url("…")` closes it early and the rest is CSS somebody else
  // wrote.
  if (key.startsWith("https://") && !/["'()\\\s]/.test(key)) return `url("${key}") 8 8, auto`;
  if (key.startsWith("http")) return "auto";

  const c = enc(color);
  const svg = (w: number, h: number, body: string) =>
    `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'%3E${body}%3C/svg%3E")`;
  switch (key) {
    case "spark":
      return `${svg(24, 24, `%3Ccircle cx='12' cy='12' r='5' fill='${c}'/%3E%3Ccircle cx='12' cy='12' r='10' fill='none' stroke='${c}' stroke-width='1.5' opacity='0.6'/%3E`)} 12 12, auto`;
    case "ring":
      return `${svg(28, 28, `%3Ccircle cx='14' cy='14' r='9' fill='none' stroke='${c}' stroke-width='2'/%3E%3Ccircle cx='14' cy='14' r='2' fill='${c}'/%3E`)} 14 14, auto`;
    case "arrow":
      return `${svg(24, 24, `%3Cpath d='M4 2l14 8-6 1.5L14 18l-3 1-2-6-5 1z' fill='${c}' stroke='%23000' stroke-width='1'/%3E`)} 4 2, auto`;
    case "gamepad":
      return `${svg(28, 28, `%3Crect x='4' y='9' width='20' height='11' rx='5' fill='${c}'/%3E%3Ccircle cx='10' cy='14' r='1.5' fill='%23fff'/%3E%3Ccircle cx='19' cy='13' r='1.3' fill='%23fff'/%3E`)} 14 14, auto`;
    case "dot":
      return `${svg(16, 16, `%3Ccircle cx='8' cy='8' r='6' fill='${c}'/%3E`)} 8 8, auto`;
    case "sword":
      return `${svg(28, 28, `%3Cpath d='M4 24l3-3 12-12 3-5-5 3-12 12-3 3z' fill='${c}' stroke='%23000' stroke-width='0.8'/%3E`)} 4 24, auto`;
    default:
      return "auto";
  }
}

export const TEMPLATES: { key: string; name: string; theme: Partial<ProfileTheme> }[] = [
  {
    key: "cosmic",
    name: "Cosmic (default)",
    theme: { mode: "dark", bg: "#04051a", panel: "#0b0d26", accent: "#8b5cf6", accent2: "#22d3ee", text: "#e8eaf6", muted: "#9aa0c3", cardStyle: "glass", buttonStyle: "neon", font: "display" },
  },
  {
    key: "midnight",
    name: "Midnight Ink",
    theme: { mode: "dark", bg: "#07080f", panel: "#10131f", accent: "#3b82f6", accent2: "#6366f1", text: "#eef2ff", muted: "#8b93b0", cardStyle: "solid", buttonStyle: "solid", font: "system" },
  },
  {
    key: "cyber",
    name: "Cyber Neon",
    theme: { mode: "dark", bg: "#0a0014", panel: "#160a24", accent: "#22d3ee", accent2: "#f0f", text: "#eafcff", muted: "#9a7fb0", cardStyle: "outline", buttonStyle: "neon", font: "mono" },
  },
  {
    key: "aurora",
    name: "Aurora Green",
    theme: { mode: "dark", bg: "#03120d", panel: "#0a1f18", accent: "#10b981", accent2: "#22d3ee", text: "#e6fff5", muted: "#7fb0a0", cardStyle: "glass", buttonStyle: "glass", font: "round" },
  },
  {
    key: "crimson",
    name: "Crimson Arena",
    theme: { mode: "dark", bg: "#140406", panel: "#240a10", accent: "#f43f5e", accent2: "#fb923c", text: "#fff0f2", muted: "#b08890", cardStyle: "solid", buttonStyle: "solid", font: "display" },
  },
  {
    key: "gold",
    name: "Champion Gold",
    theme: { mode: "dark", bg: "#0d0a02", panel: "#1a1405", accent: "#fbbf24", accent2: "#f59e0b", text: "#fff8e6", muted: "#b0a480", cardStyle: "outline", buttonStyle: "pill", font: "serif" },
  },
  {
    key: "sakura",
    name: "Sakura",
    theme: { mode: "dark", bg: "#160610", panel: "#260a1c", accent: "#f472b6", accent2: "#c084fc", text: "#fff0fa", muted: "#b088a4", cardStyle: "glass", buttonStyle: "glass", font: "round" },
  },
  {
    key: "light",
    name: "Daylight",
    theme: { mode: "light", bg: "#f4f5fb", panel: "#ffffff", accent: "#7c3aed", accent2: "#0891b2", text: "#1a1c2e", muted: "#5a5f7a", cardStyle: "solid", buttonStyle: "solid", font: "system" },
  },
  {
    key: "paper",
    name: "Clean Paper",
    theme: { mode: "light", bg: "#faf9f5", panel: "#ffffff", accent: "#059669", accent2: "#0d9488", text: "#1c1917", muted: "#6b6560", cardStyle: "outline", buttonStyle: "outline", font: "serif" },
  },
];

export const DEFAULT_THEME: ProfileTheme = {
  template: "cosmic",
  mode: "dark",
  bg: "#04051a",
  bgImage: null,
  bgBlur: 0,
  bgOverlay: 45,
  panel: "#0b0d26",
  accent: "#8b5cf6",
  accent2: "#22d3ee",
  text: "#e8eaf6",
  muted: "#9aa0c3",
  cardStyle: "glass",
  buttonStyle: "neon",
  font: "display",
  radius: 16,
  cursor: "default",
  cursorColor: "#22d3ee",
  coverUrl: null,
  coverHeight: 224,
  coverOverlay: 0,
  avatarShape: "circle",
  avatarSize: 128,
  sections: Object.fromEntries(SECTIONS.map((s) => [s.key, true])),
  order: SECTIONS.map((s) => s.key),
  sectionArt: {},
};

export const THEME_VERSION = 1;

/** A colour a gamer typed, or the default. Never a string that closes a rule. */
function colour(v: unknown, fallback: string): string {
  return typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : fallback;
}

function bounded(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

function url(v: unknown): string | null {
  // Same reasoning as the cursor: this ends up inside a CSS `url("…")` and in
  // an `img src` on a public page. A quote or a parenthesis in it is somebody
  // else's CSS, and a `javascript:` scheme is somebody else's script.
  if (typeof v !== "string" || !v) return null;
  if (/["'()\\\s<>]/.test(v)) return null;
  return v.startsWith("/") || v.startsWith("https://") ? v : null;
}

/**
 * Read a stored theme.
 *
 * ===== D16/E18 — EVERY FIELD DEGRADES, INDIVIDUALLY =====
 *
 * Not "valid or default": **field by field**. A gamer whose stored blob has one
 * unreadable colour keeps their background, their sections and their order, and
 * loses one colour. All-or-nothing here would mean a single bad value throws
 * away everything somebody built.
 *
 * The merge iterates the DEFAULTS and pulls stored values by key, rather than
 * spreading stored over default — a spread lets a stored blob carry arbitrary
 * keys, including fields from a schema we have since dropped, straight into a
 * live object.
 */
export function resolveTheme(raw: unknown): ProfileTheme {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<ProfileTheme>;
  const tmpl = TEMPLATES.find((x) => x.key === t.template)?.theme ?? {};
  const pick = <K extends keyof ProfileTheme>(key: K): ProfileTheme[K] => {
    const stored = (t as Record<string, unknown>)[key as string];
    if (stored !== undefined) return stored as ProfileTheme[K];
    const fromTemplate = (tmpl as Record<string, unknown>)[key as string];
    if (fromTemplate !== undefined) return fromTemplate as ProfileTheme[K];
    return DEFAULT_THEME[key];
  };

  const d = DEFAULT_THEME;
  const savedOrder = Array.isArray(t.order) ? t.order.filter((k) => typeof k === "string") : [];
  // Only sections that still exist, then any newly-added ones appended — a
  // saved order naming a section a later deploy removed must not leave a hole,
  // and a gamer who saved before a section existed still gets it.
  const known = new Set(SECTIONS.map((s) => s.key as string));
  const kept = savedOrder.filter((k) => known.has(k));
  const order = [...kept, ...d.order.filter((k) => !kept.includes(k))];

  return {
    v: THEME_VERSION,
    template: typeof t.template === "string" ? t.template : d.template,
    mode: pick("mode") === "light" ? "light" : "dark",
    bg: colour(pick("bg"), d.bg),
    bgImage: url(pick("bgImage")),
    bgBlur: bounded(pick("bgBlur"), 0, 20, d.bgBlur),
    bgOverlay: bounded(pick("bgOverlay"), 0, 90, d.bgOverlay),
    panel: colour(pick("panel"), d.panel),
    accent: colour(pick("accent"), d.accent),
    accent2: colour(pick("accent2"), d.accent2),
    text: colour(pick("text"), d.text),
    muted: colour(pick("muted"), d.muted),
    cardStyle: (["glass", "solid", "outline", "flat"] as const).includes(
      pick("cardStyle") as never,
    )
      ? (pick("cardStyle") as ProfileTheme["cardStyle"])
      : d.cardStyle,
    buttonStyle: (["neon", "solid", "outline", "glass", "pill"] as const).includes(
      pick("buttonStyle") as never,
    )
      ? (pick("buttonStyle") as ProfileTheme["buttonStyle"])
      : d.buttonStyle,
    font: typeof pick("font") === "string" && pick("font") in FONTS ? pick("font") : d.font,
    radius: bounded(pick("radius"), 0, 40, d.radius),
    cursor:
      typeof pick("cursor") === "string" &&
      (CURSOR_KEYS.includes(pick("cursor")) || url(pick("cursor")) !== null)
        ? pick("cursor")
        : d.cursor,
    cursorColor: colour(pick("cursorColor"), d.cursorColor),
    coverUrl: url(pick("coverUrl")),
    coverHeight: bounded(pick("coverHeight"), 0, 480, d.coverHeight),
    coverOverlay: bounded(pick("coverOverlay"), 0, 90, d.coverOverlay),
    avatarShape: AVATAR_SHAPES.includes(pick("avatarShape") as AvatarShape)
      ? (pick("avatarShape") as AvatarShape)
      : d.avatarShape,
    avatarSize: bounded(pick("avatarSize"), 48, 240, d.avatarSize),
    sections: {
      ...d.sections,
      ...Object.fromEntries(
        Object.entries((t.sections ?? {}) as Record<string, unknown>)
          .filter(([k, v]) => known.has(k) && typeof v === "boolean")
          .map(([k, v]) => [k, v as boolean]),
      ),
    },
    order,
    sectionArt: Object.fromEntries(
      Object.entries((t.sectionArt ?? {}) as Record<string, unknown>)
        .filter(([k]) => known.has(k))
        .map(([k, v]) => [k, url(v)])
        .filter((pair): pair is [string, string] => pair[1] !== null),
    ),
  };
}

/** Per-section card art, with an overlay so the words stay readable. */
export function sectionArtStyle(t: ProfileTheme, key: string): CSSProperties {
  const src = t.sectionArt?.[key];
  if (!src) return {};
  return {
    backgroundImage: `linear-gradient(rgba(4,5,26,0.60), rgba(4,5,26,0.78)), url("${src}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

/**
 * The background, for the **separate fixed layer** the page renders behind its
 * content.
 *
 * D18 — never `background-attachment: fixed`. v1 found it forces a
 * full-viewport repaint on every scroll frame, which is the reported "slow
 * scrolling" on long customized profiles; a `position: fixed` element gets the
 * same look and the compositor handles it.
 */
export function bgLayerStyle(t: ProfileTheme): CSSProperties {
  if (!t.bgImage) return {};
  const a = Math.max(0, Math.min(90, t.bgOverlay ?? 0)) / 100;
  const overlay = a > 0 ? `linear-gradient(rgba(0,0,0,${a}), rgba(0,0,0,${a})), ` : "";
  return {
    backgroundImage: `${overlay}url("${t.bgImage}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    ...(t.bgBlur > 0 ? { filter: `blur(${t.bgBlur}px)` } : {}),
  };
}

/** The cover banner, or the accent gradient when there is no image. */
export function coverStyle(t: ProfileTheme): CSSProperties {
  const a = Math.max(0, Math.min(90, t.coverOverlay ?? 0)) / 100;
  const overlay = a > 0 ? `linear-gradient(rgba(0,0,0,${a}), rgba(0,0,0,${a})), ` : "";
  return t.coverUrl
    ? {
        backgroundImage: `${overlay}url("${t.coverUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { backgroundImage: `linear-gradient(92deg, ${t.accent}, ${t.accent2})` };
}

/**
 * The CSS variables, applied to the profile's root element.
 *
 * ===== D17 — SCOPED, AND THAT IS THE WHOLE SAFETY PROPERTY =====
 *
 * Every name is prefixed `--p-` and every one is set on `.profile-root`, never
 * on `:root`. A gamer choosing a background is choosing it for their own page;
 * a variable that leaked would let them repaint Cluster's own chrome — the nav,
 * the money colour, the podium — on every page a visitor saw next.
 */
export function themeToVars(t: ProfileTheme): Record<string, string> {
  const cursor = cursorValue(t.cursor, t.cursorColor);
  return {
    "--p-bg": t.bg,
    "--p-panel": t.panel,
    "--p-accent": t.accent,
    "--p-accent2": t.accent2,
    "--p-text": t.text,
    "--p-muted": t.muted,
    "--p-radius": `${t.radius}px`,
    "--p-font": FONTS[t.font] ?? FONTS.display,
    ...(cursor && cursor !== "auto" ? { cursor } : {}),
  };
}
