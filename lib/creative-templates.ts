// Shared model for the social-media creative studio. Positions are stored as
// FRACTIONS of the canvas (0..1) so the same layout renders identically in the
// scaled preview, in the full-res PNG export, and across post vs story sizes.

export type CreativeSize = "post" | "story";
export const SIZES: Record<CreativeSize, { w: number; h: number; label: string }> = {
  post: { w: 1080, h: 1080, label: "Post · 1080×1080" },
  story: { w: 1080, h: 1920, label: "Story · 1080×1920" },
};

export type TextItem = {
  id: string; type: "text"; x: number; y: number; w: number;
  text: string; size: number;            // px at 1080-wide reference
  color: string; weight: number; align: "left" | "center" | "right";
  upper?: boolean; shadow?: boolean; lineHeight?: number;
};
export type ImageItem = {
  id: string; type: "image"; x: number; y: number; w: number;
  src: string; round?: boolean; ratio?: number;   // h/w; default keeps source ratio
};
export type CreativeItem = TextItem | ImageItem;

export type Creative = {
  bg: string | null;           // full-bleed background art
  bgTint: number;              // 0..1 darkening for legibility
  accent: string;
  items: CreativeItem[];
};

// What the studio knows about a picked database entity.
export type StudioEntity = {
  kind: "challenge" | "quest" | "game" | "leaderboard";
  id: string; title: string; subtitle: string; cover: string | null; meta: string;
};
export type BrandAssets = { logo: string; wordmark: string; astronaut: string; tagline: string };

export const TEMPLATE_IDS = ["spotlight", "banner", "minimal", "poster"] as const;
export type TemplateId = typeof TEMPLATE_IDS[number];
export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  spotlight: "Spotlight", banner: "Bottom banner", minimal: "Minimal", poster: "Poster",
};

const rid = () => "c" + Math.random().toString(36).slice(2, 8);
const KIND_KICKER: Record<StudioEntity["kind"], string> = {
  challenge: "Live Challenge", quest: "Quest", game: "Planet", leaderboard: "Leaderboard",
};

// Build an auto-filled creative for an entity + template + brand assets.
export function buildCreative(entity: StudioEntity, template: TemplateId, brand: BrandAssets, size: CreativeSize): Creative {
  const accent = "#8b5cf6";
  const kicker = KIND_KICKER[entity.kind];
  const isStory = size === "story";
  const items: CreativeItem[] = [];

  const logo: ImageItem = { id: rid(), type: "image", x: 0.06, y: 0.05, w: 0.16, src: brand.logo, round: true };
  const astronaut: ImageItem = { id: rid(), type: "image", x: 0.60, y: isStory ? 0.55 : 0.5, w: 0.36, src: brand.astronaut };

  if (template === "spotlight") {
    items.push(logo);
    items.push({ id: rid(), type: "text", x: 0.06, y: isStory ? 0.34 : 0.30, w: 0.62, text: kicker, size: 34, color: accent, weight: 800, align: "left", upper: true });
    items.push({ id: rid(), type: "text", x: 0.06, y: isStory ? 0.38 : 0.35, w: 0.82, text: entity.title, size: isStory ? 92 : 78, color: "#ffffff", weight: 800, align: "left", shadow: true, lineHeight: 1.05 });
    items.push({ id: rid(), type: "text", x: 0.06, y: isStory ? 0.60 : 0.62, w: 0.7, text: entity.meta || entity.subtitle, size: 34, color: "#cbd5e1", weight: 600, align: "left" });
    items.push(astronaut);
  } else if (template === "banner") {
    items.push(logo);
    items.push({ id: rid(), type: "text", x: 0.08, y: isStory ? 0.70 : 0.66, w: 0.84, text: kicker, size: 32, color: accent, weight: 800, align: "left", upper: true });
    items.push({ id: rid(), type: "text", x: 0.08, y: isStory ? 0.73 : 0.70, w: 0.84, text: entity.title, size: isStory ? 84 : 72, color: "#ffffff", weight: 800, align: "left", shadow: true, lineHeight: 1.05 });
    items.push({ id: rid(), type: "text", x: 0.08, y: isStory ? 0.88 : 0.88, w: 0.84, text: entity.meta || entity.subtitle, size: 30, color: "#cbd5e1", weight: 600, align: "left" });
  } else if (template === "minimal") {
    items.push({ id: rid(), type: "image", x: 0.42, y: 0.06, w: 0.16, src: brand.logo, round: true });
    items.push({ id: rid(), type: "text", x: 0.1, y: isStory ? 0.42 : 0.4, w: 0.8, text: kicker, size: 32, color: accent, weight: 800, align: "center", upper: true });
    items.push({ id: rid(), type: "text", x: 0.08, y: isStory ? 0.46 : 0.45, w: 0.84, text: entity.title, size: isStory ? 88 : 76, color: "#ffffff", weight: 800, align: "center", shadow: true, lineHeight: 1.05 });
    items.push({ id: rid(), type: "text", x: 0.1, y: isStory ? 0.66 : 0.66, w: 0.8, text: entity.meta || entity.subtitle, size: 32, color: "#cbd5e1", weight: 600, align: "center" });
  } else {
    // poster
    items.push({ id: rid(), type: "image", x: 0.06, y: 0.05, w: 0.14, src: brand.logo, round: true });
    items.push({ id: rid(), type: "text", x: 0.72, y: 0.07, w: 0.22, text: kicker, size: 26, color: accent, weight: 800, align: "right", upper: true });
    items.push({ id: rid(), type: "text", x: 0.08, y: isStory ? 0.72 : 0.7, w: 0.84, text: entity.title, size: isStory ? 96 : 84, color: "#ffffff", weight: 800, align: "left", shadow: true, lineHeight: 1.02 });
    items.push({ id: rid(), type: "text", x: 0.08, y: isStory ? 0.9 : 0.9, w: 0.6, text: entity.meta || entity.subtitle, size: 30, color: "#cbd5e1", weight: 600, align: "left" });
    items.push(astronaut);
  }

  return { bg: entity.cover, bgTint: template === "minimal" ? 0.55 : 0.42, accent, items };
}

// Send external art through our CORS proxy so the exported <canvas> isn't tainted.
export function proxied(src: string): string {
  if (!src) return src;
  if (src.startsWith("data:") || src.startsWith("/")) return src;
  try {
    const h = new URL(src).host;
    if (/\.public\.blob\.vercel-storage\.com$|cloudfront\.net$|ddragon\.leagueoflegends\.com$|valorant-api\.com$|steamstatic\.com$|fortnite-api\.com$|higgsfield/i.test(h)) {
      return `/api/creative/image?url=${encodeURIComponent(src)}`;
    }
  } catch { /* fall through */ }
  return src;
}
