import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { giftSearch, MIN_QUERY, MAX_RESULTS } from "@/lib/gift-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Type-ahead for the gift box (B5.1).
//
// **Signed in only.** What this returns is public — the same name, slug and
// avatar a profile page shows a stranger — but returning it eight rows at a
// time to anybody who asks turns a profile page into an enumerable member
// directory, and the standing rule is that the gamer directory is admin-only.
// A session does not make it a directory; it makes it the address book of
// somebody who already has an account.
//
// Never an email, in any shape. `giftSearch` does not select the column.

/**
 * A best-effort per-session throttle.
 *
 * In-process, so on serverless it is per-instance and a determined caller with
 * a valid session can beat it by being routed elsewhere. Said plainly rather
 * than dressed up: this stops a type-ahead firing sixty times a second on a
 * fast typist, which is what it is for. A real limiter is shared state, and
 * this endpoint returning public profile fields does not justify one yet.
 */
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

function throttled(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  // Unbounded growth would be a leak in a long-lived process.
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

export async function GET(req: NextRequest) {
  const me = await getCurrentUser().catch(() => null);
  if (!me) return NextResponse.json({ results: [] }, { status: 401 });
  if (throttled(me.id)) return NextResponse.json({ results: [] }, { status: 429 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < MIN_QUERY) return NextResponse.json({ results: [] });

  const results = await giftSearch(q, { excludeUserId: me.id, limit: MAX_RESULTS });
  return NextResponse.json({ results }, {
    // Per-user results, so a shared cache would serve one gamer's search to
    // another. Private and short — long enough to cover a backspace.
    headers: { "Cache-Control": "private, max-age=5" },
  });
}
