import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { serveAds } from "@/lib/ads";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const placement = req.nextUrl.searchParams.get("placement");
  if (!placement) return NextResponse.json({ error: "placement required" }, { status: 400 });
  const ua = req.headers.get("user-agent") ?? "";
  const device = /mobile|android|iphone/i.test(ua) ? "mobile" : "desktop";
  const db = await getDb();
  const served = await serveAds(db, placement, device);
  if (!served) return NextResponse.json({ creatives: [] });
  return NextResponse.json(served);
}
