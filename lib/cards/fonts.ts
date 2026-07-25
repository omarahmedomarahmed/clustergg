import { readFile } from "fs/promises";
import path from "path";

// Optional brand typography for the generated PNG cards.
//
// `ImageResponse` ships with a vendored Noto Sans, so cards render perfectly
// with no font files present. If someone drops OFL TTF/WOFF files into
// `public/fonts/` (Space Grotesk for latin, Cairo for arabic), we pick them up
// automatically and the cards upgrade to brand typography with no code change.
// WOFF2 is intentionally not supported — satori cannot parse it.

export type CardFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

const CANDIDATES: { file: string; name: string; weight: 400 | 700 }[] = [
  { file: "SpaceGrotesk-Regular.ttf", name: "Cluster", weight: 400 },
  { file: "SpaceGrotesk-Bold.ttf", name: "Cluster", weight: 700 },
  { file: "Cairo-Regular.ttf", name: "ClusterAr", weight: 400 },
  { file: "Cairo-Bold.ttf", name: "ClusterAr", weight: 700 },
];

let cached: CardFont[] | null = null;

// Load whatever brand fonts exist. Returns [] when none are installed, which
// tells the renderer to fall back to the built-in font.
export async function loadCardFonts(): Promise<CardFont[]> {
  if (cached) return cached;
  const dir = path.join(process.cwd(), "public", "fonts");
  const out: CardFont[] = [];
  for (const c of CANDIDATES) {
    try {
      const buf = await readFile(path.join(dir, c.file));
      out.push({
        name: c.name,
        // Copy into a standalone ArrayBuffer (satori rejects pooled views).
        data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
        weight: c.weight,
        style: "normal",
      });
    } catch { /* not installed — fine */ }
  }
  cached = out;
  return out;
}

// The font-family string to use in card markup. Falls back to the built-in.
export function cardFontFamily(fonts: CardFont[]): string {
  return fonts.length ? `"${fonts[0].name}", sans-serif` : "sans-serif";
}
