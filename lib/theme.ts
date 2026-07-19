// Gamer profile customization engine. A "theme" is a small JSON blob the gamer
// edits in the profile builder; it renders to inline CSS variables + a scoped
// stylesheet on their public /u/[slug] page. Everything degrades to sane
// cosmic defaults when a field is missing.

import type { CSSProperties } from "react";

export type ProfileTheme = {
  template: string;          // preset key applied as a starting point
  mode: "dark" | "light";
  bg: string;                // page background color
  bgImage: string | null;    // page background image URL
  bgBlur: number;            // 0-20 px backdrop blur over bg image
  bgOverlay: number;         // 0-90 % dark overlay over bg image (readability)
  panel: string;             // card background color
  accent: string;            // primary accent
  accent2: string;           // secondary accent (gradients)
  text: string;              // main text color
  muted: string;             // secondary text color
  cardStyle: "glass" | "solid" | "outline" | "flat";
  buttonStyle: "neon" | "solid" | "outline" | "glass" | "pill";
  font: string;              // font family key
  radius: number;            // corner radius px
  cursor: string;            // cursor preset key or a custom image URL
  cursorColor: string;       // tint for the built-in cursors
  coverUrl: string | null;   // profile cover/banner image
  coverHeight: number;       // cover banner height px
  coverOverlay: number;      // 0-90 % dark overlay over the cover image
  avatarShape: AvatarShape;
  avatarSize: number;        // avatar diameter px
  sections: Record<string, boolean>;  // visibility
  order: string[];           // section order
  sectionArt: Record<string, string>; // per-section card background image URL
};

export type AvatarShape = "circle" | "rounded" | "square" | "heart" | "star" | "lightning" | "hexagon";
export const AVATAR_SHAPES: AvatarShape[] = ["circle", "rounded", "square", "hexagon", "heart", "star", "lightning"];

// Scalable clip-path polygons (% so they resize with the avatar). circle /
// rounded / square use border-radius instead.
const CLIP: Partial<Record<AvatarShape, string>> = {
  heart: "polygon(50% 100%, 14% 66%, 0% 38%, 8% 16%, 30% 10%, 50% 27%, 70% 10%, 92% 16%, 100% 38%, 86% 66%)",
  star: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
  lightning: "polygon(52% 0%, 18% 56%, 44% 56%, 28% 100%, 84% 40%, 52% 40%)",
  hexagon: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
};
export function avatarClip(shape: AvatarShape): string | undefined {
  return CLIP[shape];
}

export const SECTIONS = [
  { key: "accounts", label: "Connected accounts" },
  { key: "quests", label: "Quests & Cluster Points" },
  { key: "standings", label: "Leaderboard standings" },
  { key: "trophies", label: "Trophy case" },
  { key: "badges", label: "Badges" },
  { key: "challenges", label: "Active challenges" },
  { key: "activity", label: "Recent posts" },
  { key: "spaces", label: "My planets" },
] as const;

export const FONTS: Record<string, string> = {
  grotesk: "var(--font-grotesk), system-ui, sans-serif",
  system: "system-ui, -apple-system, sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
  serif: "Georgia, 'Times New Roman', serif",
  round: "'Trebuchet MS', 'Segoe UI', sans-serif",
};

// Cursor presets — recolorable. Custom URLs (http…) are used verbatim.
export const CURSOR_KEYS = ["default", "crosshair", "spark", "ring", "arrow", "gamepad", "dot", "sword"];
const enc = (c: string) => c.replace("#", "%23");

// Build the CSS cursor value for a preset key in the chosen color.
export function cursorValue(key: string, color = "#22d3ee"): string {
  if (!key || key === "default") return "auto";
  if (key === "crosshair") return "crosshair";
  if (key.startsWith("http")) return `url("${key}") 8 8, auto`;
  const c = enc(color);
  const svg = (w: number, h: number, body: string) =>
    `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'%3E${body}%3C/svg%3E")`;
  switch (key) {
    case "spark": return `${svg(24, 24, `%3Ccircle cx='12' cy='12' r='5' fill='${c}'/%3E%3Ccircle cx='12' cy='12' r='10' fill='none' stroke='${c}' stroke-width='1.5' opacity='0.6'/%3E`)} 12 12, auto`;
    case "ring": return `${svg(28, 28, `%3Ccircle cx='14' cy='14' r='9' fill='none' stroke='${c}' stroke-width='2'/%3E%3Ccircle cx='14' cy='14' r='2' fill='${c}'/%3E`)} 14 14, auto`;
    case "arrow": return `${svg(24, 24, `%3Cpath d='M4 2l14 8-6 1.5L14 18l-3 1-2-6-5 1z' fill='${c}' stroke='%23000' stroke-width='1'/%3E`)} 4 2, auto`;
    case "gamepad": return `${svg(28, 28, `%3Crect x='4' y='9' width='20' height='11' rx='5' fill='${c}'/%3E%3Ccircle cx='10' cy='14' r='1.5' fill='%23fff'/%3E%3Ccircle cx='19' cy='13' r='1.3' fill='%23fff'/%3E`)} 14 14, auto`;
    case "dot": return `${svg(16, 16, `%3Ccircle cx='8' cy='8' r='6' fill='${c}'/%3E`)} 8 8, auto`;
    case "sword": return `${svg(28, 28, `%3Cpath d='M4 24l3-3 12-12 3-5-5 3-12 12-3 3z' fill='${c}' stroke='%23000' stroke-width='0.8'/%3E`)} 4 24, auto`;
    default: return "auto";
  }
}

// One-click background images for the builder (Higgsfield-generated + brand art).
const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082";
export const BG_PRESETS: { name: string; url: string }[] = [
  { name: "Violet Nebula", url: `${CDN}/hf_20260712_212340_18920f6b-9da8-47f6-8c17-82b17b56abf6.png` },
  { name: "Cyber Neon", url: `${CDN}/hf_20260712_212345_26b6fa40-299d-43db-b0f2-077a00be6f60.png` },
  { name: "Deep Space", url: `${CDN}/hf_20260710_145725_dffb17ff-3d2b-4e24-9f6b-a160a4de4abd.png` },
  { name: "Aurora", url: `${CDN}/hf_20260710_194218_8378a101-637e-4c40-ab96-72085790ccf4.png` },
];

export const TEMPLATES: { key: string; name: string; theme: Partial<ProfileTheme> }[] = [
  {
    key: "cosmic", name: "Cosmic (default)",
    theme: { mode: "dark", bg: "#04051a", panel: "#0b0d26", accent: "#8b5cf6", accent2: "#22d3ee", text: "#e8eaf6", muted: "#9aa0c3", cardStyle: "glass", buttonStyle: "neon", font: "grotesk" },
  },
  {
    key: "midnight", name: "Midnight Ink",
    theme: { mode: "dark", bg: "#07080f", panel: "#10131f", accent: "#3b82f6", accent2: "#6366f1", text: "#eef2ff", muted: "#8b93b0", cardStyle: "solid", buttonStyle: "solid", font: "system" },
  },
  {
    key: "cyber", name: "Cyber Neon",
    theme: { mode: "dark", bg: "#0a0014", panel: "#160a24", accent: "#22d3ee", accent2: "#f0f", text: "#eafcff", muted: "#9a7fb0", cardStyle: "outline", buttonStyle: "neon", font: "mono" },
  },
  {
    key: "aurora", name: "Aurora Green",
    theme: { mode: "dark", bg: "#03120d", panel: "#0a1f18", accent: "#10b981", accent2: "#22d3ee", text: "#e6fff5", muted: "#7fb0a0", cardStyle: "glass", buttonStyle: "glass", font: "round" },
  },
  {
    key: "crimson", name: "Crimson Arena",
    theme: { mode: "dark", bg: "#140406", panel: "#240a10", accent: "#f43f5e", accent2: "#fb923c", text: "#fff0f2", muted: "#b08890", cardStyle: "solid", buttonStyle: "solid", font: "grotesk" },
  },
  {
    key: "gold", name: "Champion Gold",
    theme: { mode: "dark", bg: "#0d0a02", panel: "#1a1405", accent: "#fbbf24", accent2: "#f59e0b", text: "#fff8e6", muted: "#b0a480", cardStyle: "outline", buttonStyle: "pill", font: "serif" },
  },
  {
    key: "sakura", name: "Sakura",
    theme: { mode: "dark", bg: "#160610", panel: "#260a1c", accent: "#f472b6", accent2: "#c084fc", text: "#fff0fa", muted: "#b088a4", cardStyle: "glass", buttonStyle: "glass", font: "round" },
  },
  {
    key: "light", name: "Daylight",
    theme: { mode: "light", bg: "#f4f5fb", panel: "#ffffff", accent: "#7c3aed", accent2: "#0891b2", text: "#1a1c2e", muted: "#5a5f7a", cardStyle: "solid", buttonStyle: "solid", font: "system" },
  },
  {
    key: "paper", name: "Clean Paper",
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
  font: "grotesk",
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

export function resolveTheme(raw: unknown): ProfileTheme {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<ProfileTheme>;
  const tmpl = TEMPLATES.find((x) => x.key === t.template)?.theme ?? {};
  const merged = { ...DEFAULT_THEME, ...tmpl, ...t };
  const savedOrder = Array.isArray(t.order) && t.order.length ? t.order : DEFAULT_THEME.order;
  // Append any newly-added default sections (e.g. "quests") that a saved order
  // predates, so existing gamers still get them (they can then reorder).
  const order = [...savedOrder, ...DEFAULT_THEME.order.filter((k) => !savedOrder.includes(k))];
  return {
    ...merged,
    sections: { ...DEFAULT_THEME.sections, ...(t.sections ?? {}) },
    order,
    sectionArt: (t.sectionArt && typeof t.sectionArt === "object" ? t.sectionArt : {}) as Record<string, string>,
  };
}

// Per-section card background art (+ dark overlay so text stays readable). Empty
// when the gamer hasn't set art for that section. Shared by builder + public page.
export function sectionArtStyle(t: ProfileTheme, key: string): CSSProperties {
  const url = t.sectionArt?.[key];
  if (!url) return {};
  return {
    backgroundImage: `linear-gradient(rgba(4,5,26,0.60), rgba(4,5,26,0.78)), url("${url}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

// Background style (image + dark overlay for readability) shared by the builder
// preview and the public profile so they render identically. NOTE: we do NOT
// use `background-attachment: fixed` — on a long, heavily-customized page that
// forces a full-viewport repaint on every scroll frame (the reported "slow /
// delayed scrolling"). The public page instead renders `bgLayerStyle` on a
// separate `position: fixed` layer, which the compositor handles jank-free.
export function bgStyle(t: ProfileTheme): CSSProperties {
  if (!t.bgImage) return {};
  const a = Math.max(0, Math.min(90, t.bgOverlay ?? 0)) / 100;
  const overlay = a > 0 ? `linear-gradient(rgba(0,0,0,${a}), rgba(0,0,0,${a})), ` : "";
  return {
    backgroundImage: `${overlay}url("${t.bgImage}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

// The fixed full-viewport background layer for the public profile: same image +
// overlay, but meant for a `position: fixed; inset: 0` element behind the
// content so scrolling stays smooth.
export function bgLayerStyle(t: ProfileTheme): CSSProperties {
  if (!t.bgImage) return {};
  const a = Math.max(0, Math.min(90, t.bgOverlay ?? 0)) / 100;
  const overlay = a > 0 ? `linear-gradient(rgba(0,0,0,${a}), rgba(0,0,0,${a})), ` : "";
  return {
    backgroundImage: `${overlay}url("${t.bgImage}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

// Cover style (image + dark overlay) shared by builder preview and public page.
export function coverStyle(t: ProfileTheme, coverUrl: string | null): CSSProperties {
  const a = Math.max(0, Math.min(90, t.coverOverlay ?? 0)) / 100;
  const overlay = a > 0 ? `linear-gradient(rgba(0,0,0,${a}), rgba(0,0,0,${a})), ` : "";
  return coverUrl
    ? { backgroundImage: `${overlay}url("${coverUrl}")`, backgroundSize: "cover", backgroundPosition: "center" }
    : { backgroundImage: `linear-gradient(92deg, ${t.accent}, ${t.accent2})` };
}

// CSS custom properties applied to the profile root element.
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
    "--p-font": FONTS[t.font] ?? FONTS.grotesk,
    ...(cursor && cursor !== "auto" ? { cursor } : {}),
  };
}
