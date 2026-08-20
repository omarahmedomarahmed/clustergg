// Assets, and what happens when one is missing.
//
// ===== D23 — A MISSING ASSET RENDERS A DESIGNED PLACEHOLDER =====
//
// *"Never a broken-image icon and never nothing."* Those two failures are
// worse than they look and in different ways: a browser's broken-image glyph
// says the platform is broken, and an empty box says nothing at all, so
// whoever is looking cannot tell a missing asset from a design with a gap in
// it. Neither tells anybody the one useful thing, which is *this picture has
// not arrived yet*.
//
// ===== D22 — SERVED FROM `public/` OR BLOB. NEVER A HOTLINK =====
//
// A provider's CDN breaks when they reorganise it, and until then it is
// somebody else's bandwidth paying for our pages. `assetUrl` is where that is
// decided, so there is one place to look rather than one per image.
//
// `public/` did not exist at all before this sprint, which is why this module
// is here rather than in the design pass: a fence with nothing behind it is a
// fence around a hole.

/** The designed stand-in. Real art, not a grey box, and it says what it is. */
export const PLACEHOLDER = "/placeholder.svg";

/**
 * Where an image actually lives.
 *
 * Returns the placeholder for anything this platform will not serve — nothing,
 * a blank string, or a URL on somebody else's CDN. D22 is enforced here rather
 * than by review, because a hotlink is a one-character change in a template and
 * it works perfectly until the day it does not.
 */
export function assetUrl(src: string | null | undefined): string {
  if (!src) return PLACEHOLDER;
  const trimmed = src.trim();
  if (!trimmed) return PLACEHOLDER;

  // Ours: a path under `public/`, or an upload we stored.
  if (trimmed.startsWith("/")) return trimmed;

  // Blob, and nothing else. A configured store is ours in the sense that
  // matters — we put the bytes there and we can serve them tomorrow.
  const blobHost = process.env.BLOB_PUBLIC_HOST;
  if (blobHost && trimmed.startsWith(`https://${blobHost}/`)) return trimmed;
  if (/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(trimmed)) return trimmed;

  return PLACEHOLDER;
}

/**
 * Whether an image is the stand-in rather than the real thing.
 *
 * Exposed so a surface can say *"artwork is on its way"* in words as well as
 * in a picture — a placeholder that looks like a design decision is a
 * placeholder nobody ever replaces.
 */
export function isPlaceholder(src: string | null | undefined): boolean {
  return assetUrl(src) === PLACEHOLDER;
}
