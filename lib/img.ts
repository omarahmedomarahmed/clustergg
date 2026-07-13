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
