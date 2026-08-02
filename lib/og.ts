import type { Metadata } from "next";

// What a Cluster link looks like when somebody pastes it.
//
// Every page shared the same static cover, so a gamer posting their profile in
// their server got a picture of our logo — a link that says nothing about what
// is behind it, in the one place a link has to sell itself. Discord renders
// that preview to thousands of people and it was the same image every time.
//
// The fix needed no new renderer. The bot already draws a 1200×630 PNG of every
// object in the product — a profile, a challenge, a game's planet, the week's
// standings — at exactly OpenGraph's dimensions, cached in Blob and admin-
// editable in the card studio. `/api/card/*` was already documented as doubling
// as OpenGraph art; the pages simply never pointed at it.
//
// So a shared link previews the thing it links to, and it stays correct: the
// card is rendered from live data at request time, so a profile that gained a
// trophy this morning previews with it.

/** Where a card of this kind lives. Relative — `metadataBase` absolutises it. */
export function cardUrl(kind: string, params: Record<string, string | null | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return `/api/card/${kind}${s ? `?${s}` : ""}`;
}

/**
 * The OpenGraph + Twitter image pair for a page.
 *
 * Both are set together, always. They are read by different crawlers and a page
 * that sets only one previews correctly in half the places it gets pasted,
 * which is the kind of bug nobody reports because everybody sees a different
 * half of it.
 */
export function cardMeta(kind: string, params: Record<string, string | null | undefined>, alt: string): Pick<Metadata, "openGraph" | "twitter"> {
  const url = cardUrl(kind, params);
  return {
    openGraph: { images: [{ url, width: 1200, height: 630, alt }] },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

/**
 * The platform's own card — every game as a planet.
 *
 * The default for anything that isn't one particular object: the landing page,
 * the server directory, the pricing page. It is a real snapshot of what is
 * live, not a logo, which is the whole point.
 */
export const SITE_CARD = cardUrl("planets");
