// Guard list/nav rendering against megabyte inline data URLs. Hosted URLs
// (http/https) and small data URLs pass through; oversized inline images return
// null so a lightweight fallback tile renders instead of shipping base64 in the
// HTML of every page. Re-uploading with Vercel Blob configured yields a short
// hosted URL that always passes.
export function slimImg(url?: string | null, maxChars = 60000): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) return url.length <= maxChars ? url : null;
  return url;
}

/**
 * Route an image through Next's optimizer.
 *
 * This is a BILLING fix as much as a performance one. Uploaded art lives in
 * Vercel Blob, and every Blob read counts against Fast Origin Transfer — the
 * Hobby allowance is 10 GB. Rendering a 5 MB profile background with a plain
 * `<img src={blobUrl}>` re-reads all 5 MB from Blob on every single view, from
 * every visitor, forever. A few hundred page views is the whole month's
 * allowance, which is exactly how this project reached 75% with no users.
 *
 * `/_next/image` fixes both halves of that: it downscales to the width actually
 * displayed and converts to WebP/AVIF (5 MB becomes tens of KB), and the
 * optimized result is cached on the CDN — so Blob is read ONCE per variant
 * instead of once per view.
 *
 * It's a plain URL, so it works in `background-image: url(...)` too, which is
 * how half this site draws its art.
 *
 * Passed through untouched:
 *  - data: URLs — already inline, nothing to fetch, and the optimizer rejects them
 *  - SVG — not optimized without `dangerouslyAllowSVG`, and vectors are small anyway
 *  - anything already pointing at the optimizer, so this is safe to apply twice
 */
export function optImg(url?: string | null, width = 1200, quality = 70): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith("data:") || u.startsWith("blob:")) return u;
  if (u.startsWith("/_next/image")) return u;
  // Query strings are common on signed/CDN URLs, so match the path only.
  if (/\.svg($|\?|#)/i.test(u)) return u;
  // Only http(s) and same-origin paths are things the optimizer can fetch.
  if (!/^https?:\/\//i.test(u) && !u.startsWith("/")) return u;

  // Next only accepts widths from its configured deviceSizes/imageSizes list;
  // anything else 400s. These are the defaults, so a caller can ask for any
  // width and get the nearest allowed one up.
  const ALLOWED = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];
  const w = ALLOWED.find((n) => n >= width) ?? ALLOWED[ALLOWED.length - 1];
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  return `/_next/image?url=${encodeURIComponent(u)}&w=${w}&q=${q}`;
}

/** `background-image` value for a URL, optimized, or undefined when there's none. */
export function bgImage(url?: string | null, width = 1920, quality = 70): string | undefined {
  const src = optImg(url, width, quality);
  return src ? `url(${src})` : undefined;
}
