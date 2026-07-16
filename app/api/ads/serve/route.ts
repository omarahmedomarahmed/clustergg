import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { serveAds, type ServedPlacement } from "@/lib/ads";

export const dynamic = "force-dynamic";

// Short-lived in-memory cache of the resolved placement payload, keyed by
// placement+device. Ads change rarely (admin edits) but this endpoint is hit on
// nearly every page load for every ad slot — without a cache each hit re-reads
// creative rows from Neon. A 60s TTL collapses thousands of identical reads into
// one, and the client sends `Cache-Control` so the browser/CDN also dedupe.
type Entry = { at: number; data: ServedPlacement | null };
const CACHE = new Map<string, Entry>();
const TTL_MS = 60_000;

export async function GET(req: NextRequest) {
  const placement = req.nextUrl.searchParams.get("placement");
  if (!placement) return NextResponse.json({ error: "placement required" }, { status: 400 });
  const ua = req.headers.get("user-agent") ?? "";
  const device = /mobile|android|iphone/i.test(ua) ? "mobile" : "desktop";

  const key = `${placement}:${device}`;
  const hit = CACHE.get(key);
  const fresh = hit && Date.now() - hit.at < TTL_MS ? hit.data : undefined;

  let served: ServedPlacement | null;
  if (fresh !== undefined) {
    served = fresh;
  } else {
    const db = await getDb();
    served = await serveAds(db, placement, device);
    CACHE.set(key, { at: Date.now(), data: served });
  }

  const body = served ?? { creatives: [] };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120" },
  });
}
