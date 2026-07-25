// Images for PNG cards.
//
// Satori (what `ImageResponse` runs on) fetches remote `<img src>` itself at
// render time, and that is fragile in exactly the places a profile card is
// most personal:
//
//   * It cannot rasterize **GIF** or **SVG**. An animated Discord avatar is a
//     `.gif` URL, so the moment a gamer has Nitro their card fails to render.
//   * A slow or dead host stalls the render past Discord's 3-second budget.
//   * Any fetch failure throws, and one broken avatar takes the whole card down
//     rather than just that one image.
//
// So we resolve every image ourselves BEFORE rendering: fetch it, check what it
// actually is, and hand Satori raw bytes as a data URL. Anything unusable
// becomes `null`, and every card body already draws a branded placeholder when
// an image is null. A bad avatar now costs you an avatar, not a card.

const MAX_BYTES = 2_500_000;
const TIMEOUT_MS = 2500;

// Formats Satori/resvg can actually decode.
const OK_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

type Entry = { value: string | null; at: number };
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, Entry>();

// Discord serves animated avatars as .gif. The same asset is always available
// as .png, so ask for that instead of dropping the avatar entirely.
function normalize(url: string): string {
  if (/^https:\/\/cdn\.discordapp\.com\//.test(url)) {
    return url.replace(/\.gif(\?|$)/i, ".png$1");
  }
  return url;
}

export async function toEmbeddable(raw: string | null | undefined): Promise<string | null> {
  if (!raw) return null;

  // Already inline — Satori reads it directly, no fetch needed.
  if (raw.startsWith("data:")) {
    const type = raw.slice(5, raw.indexOf(";")).toLowerCase();
    return OK_TYPES.has(type) ? raw : null;
  }
  if (!/^https?:\/\//i.test(raw)) return null;

  const url = normalize(raw);
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;

  let value: string | null = null;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "image/png,image/jpeg,image/webp,image/*" },
      cache: "no-store",
    });
    if (res.ok) {
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const len = Number(res.headers.get("content-length") ?? "0");
      if (OK_TYPES.has(type) && len <= MAX_BYTES) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength <= MAX_BYTES) value = `data:${type};base64,${buf.toString("base64")}`;
      }
    }
  } catch { /* unreachable, too slow, or too big — the card renders without it */ }

  cache.set(url, { value, at: Date.now() });
  return value;
}

// Resolve a batch in parallel — a profile card has an avatar, a banner and up
// to six game logos, and doing them one at a time would blow the budget.
export async function toEmbeddableAll(urls: (string | null | undefined)[]): Promise<(string | null)[]> {
  return Promise.all(urls.map(toEmbeddable));
}
