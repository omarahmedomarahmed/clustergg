import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPlanetExplore } from "@/lib/planet-explore";
import { getT } from "@/lib/i18n/t-server";

export const dynamic = "force-dynamic";

// Planet-explorer sidebar data (leaderboards, champion boards, challenges,
// region players) for one planet. Powers lazy-loading when browsing planets in
// the landing hero, and the in-place "refresh" button on the explorer.
export async function GET(req: NextRequest) {
  const slug = String(req.nextUrl.searchParams.get("slug") ?? "");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  const db = await getDb();
  const { te } = await getT();
  const data = await getPlanetExplore(db, slug, te);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}
