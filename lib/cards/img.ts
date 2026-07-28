// Images for PNG cards.
//
// Satori (what `ImageResponse` runs on) decodes only **PNG and JPEG**. Give it
// anything else and it throws *inside* the render — which takes down the whole
// card, not just the one image.
//
// That is not a corner case here: every piece of brand art in `lib/assets.ts`
// is **WebP**, and game logos are frequently SVG. So for a long time the only
// cards that rendered were the ones with no artwork at all — a guide card
// worked, and every profile, planet, challenge, stats and leaderboard card
// failed, because each of those has a background.
//
// So we resolve every image ourselves BEFORE rendering: fetch it, decode it,
// and hand Satori raw PNG/JPEG bytes as a data URL. Anything we can't convert
// becomes `null`, and every card body already draws a branded placeholder when
// an image is null. A bad image now costs you that image, not the card.

import type { Sharp } from "sharp";

// What Satori itself can decode. Everything else has to be transcoded.
const NATIVE = new Set(["image/png", "image/jpeg", "image/jpg"]);

// What we're willing to convert from. Sharp handles all of these.
const CONVERTIBLE = new Set([
  "image/webp", "image/avif", "image/gif", "image/tiff", "image/bmp", "image/svg+xml",
]);

// Ceiling on what we'll pull over the wire before converting. Generous because
// the conversion step downscales — the limit that matters is the OUTPUT size.
const MAX_FETCH_BYTES = 16_000_000;
// A card is 1200x630, so nothing needs to arrive bigger than this.
const DEFAULT_MAX_W = 1200;
// Per-image ceiling. Deliberately tight: a game-stats card resolves an avatar,
// a logo, up to five champion icons and five match icons, and the gamer is
// waiting on a button press. One slow CDN must cost that image, not the card.
const TIMEOUT_MS = 2200;

type Entry = { value: string | null; at: number };
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, Entry>();

// Discord serves animated avatars as .gif. The same asset is always available
// as .png, so ask for that rather than paying for a conversion.
function normalize(url: string): string {
  if (/^https:\/\/cdn\.discordapp\.com\//.test(url)) {
    return url.replace(/\.gif(\?|$)/i, ".png$1");
  }
  return url;
}

// Sharp ships with Next for image optimization, but treat it as optional: if it
// can't be loaded we fall back to "native formats only" rather than throwing,
// which costs artwork but never a card.
let sharpMod: ((input: Buffer) => Sharp) | null | undefined;
async function getSharp() {
  if (sharpMod !== undefined) return sharpMod;
  try {
    const mod = await import("sharp");
    sharpMod = (mod.default ?? mod) as unknown as (input: Buffer) => Sharp;
  } catch { sharpMod = null; }
  return sharpMod;
}

function guessType(url: string, header: string | null): string {
  const fromHeader = (header ?? "").split(";")[0].trim().toLowerCase();
  if (fromHeader.startsWith("image/")) return fromHeader;
  // Some CDNs serve application/octet-stream. Fall back to the extension.
  const ext = /\.([a-z0-9]+)(?:\?|$)/i.exec(url)?.[1]?.toLowerCase();
  switch (ext) {
    case "png": return "image/png";
    case "jpg": case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "avif": return "image/avif";
    case "gif": return "image/gif";
    case "svg": return "image/svg+xml";
    default: return fromHeader || "";
  }
}

// Above this, an image is worth recompressing even if Satori could read it —
// a gamer's uploaded profile background is routinely 2-10 MB, and handing that
// to the renderer wastes far more time than the conversion costs.
const RECOMPRESS_OVER_BYTES = 400_000;

// Turn whatever we got into bytes Satori can actually decode, at a size a
// 1200x630 card can actually use.
async function toNativeBytes(buf: Buffer, type: string, maxWidth: number): Promise<{ data: Buffer; type: string } | null> {
  const sharp = await getSharp();

  if (!sharp) {
    // No transcoder: pass through what Satori reads natively, drop the rest.
    return NATIVE.has(type) ? { data: buf, type } : null;
  }
  if (!NATIVE.has(type) && !CONVERTIBLE.has(type)) return null;

  try {
    const meta = await sharp(buf).metadata();
    const tooWide = (meta.width ?? 0) > maxWidth;
    const tooHeavy = buf.byteLength > RECOMPRESS_OVER_BYTES;

    // Small, already-native, already-sized: nothing to gain from a round trip.
    if (NATIVE.has(type) && !tooWide && !tooHeavy) return { data: buf, type };

    let pipeline = sharp(buf);
    if (tooWide) pipeline = pipeline.resize({ width: maxWidth });
    const data = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    return { data, type: "image/png" };
  } catch {
    // Conversion failed but the original may still be usable as-is.
    return NATIVE.has(type) ? { data: buf, type } : null;
  }
}

export async function toEmbeddable(
  raw: string | null | undefined,
  opts: { maxWidth?: number } = {},
): Promise<string | null> {
  if (!raw) return null;
  const maxWidth = opts.maxWidth ?? DEFAULT_MAX_W;

  // Already inline. Still has to be a format Satori can read, so an inline
  // WebP gets converted exactly like a remote one.
  //
  // Not every data URL is base64. Our own house ad creatives are
  // `data:image/svg+xml;utf8,<percent-encoded svg>` — reading those as base64
  // produced bytes that were not an image, so every house creative silently
  // resolved to nothing. The payload encoding is declared in the URL; read it
  // rather than assume it.
  if (raw.startsWith("data:")) {
    const comma = raw.indexOf(",");
    if (comma < 0) return null;
    const meta = raw.slice(5, comma);
    const type = meta.split(";")[0].trim().toLowerCase();
    const isBase64 = /;\s*base64/i.test(meta);
    const payload = raw.slice(comma + 1);
    if (NATIVE.has(type) && isBase64) return raw;
    if (!NATIVE.has(type) && !CONVERTIBLE.has(type)) return null;
    try {
      const bytes = isBase64
        ? Buffer.from(payload, "base64")
        : Buffer.from(decodeURIComponent(payload), "utf8");
      const out = await toNativeBytes(bytes, type, maxWidth);
      return out ? `data:${out.type};base64,${out.data.toString("base64")}` : null;
    } catch { return null; }
  }
  if (!/^https?:\/\//i.test(raw)) return null;

  const url = normalize(raw);
  const cacheKey = `${url}@${maxWidth}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;

  let value: string | null = null;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "image/*" },
      cache: "no-store",
    });
    if (res.ok) {
      const type = guessType(url, res.headers.get("content-type"));
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared <= MAX_FETCH_BYTES) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength <= MAX_FETCH_BYTES) {
          const out = await toNativeBytes(buf, type, maxWidth);
          if (out) value = `data:${out.type};base64,${out.data.toString("base64")}`;
        }
      }
    }
  } catch { /* unreachable, too slow, or undecodable — the card renders without it */ }

  cache.set(cacheKey, { value, at: Date.now() });
  return value;
}

// Resolve a batch in parallel — a profile card has an avatar, a background and
// up to six game logos, and doing them one at a time would blow the budget.
export async function toEmbeddableAll(
  urls: (string | null | undefined)[],
  opts: { maxWidth?: number } = {},
): Promise<(string | null)[]> {
  return Promise.all(urls.map((u) => toEmbeddable(u, opts)));
}

// A hard ceiling on the WHOLE image step for one card.
//
// Individual timeouts bound each fetch, but a card with a dozen images can
// still add up past what a person will wait for after tapping a button. This
// caps the total: whatever has resolved by the deadline is drawn, the rest
// render as their placeholder.
export const CARD_IMAGE_BUDGET_MS = 3200;

export function withDeadline<T>(work: Promise<T>, fallback: T, ms = CARD_IMAGE_BUDGET_MS): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms).unref?.()),
  ]);
}
