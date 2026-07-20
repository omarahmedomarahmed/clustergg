import { NextRequest, NextResponse } from "next/server";
import { getCachedEntityDetail } from "@/lib/game-world-cache";

export const dynamic = "force-dynamic";

// Full detail (splash/portrait + lore + abilities) for one game-world entity.
// Served from our Blob snapshot when synced, else live.
export async function GET(req: NextRequest) {
  const game = String(req.nextUrl.searchParams.get("game") ?? "");
  const kind = String(req.nextUrl.searchParams.get("kind") ?? "");
  const id = String(req.nextUrl.searchParams.get("id") ?? "");
  if (!game || !id) return NextResponse.json({ error: "game and id required" }, { status: 400 });
  const detail = await getCachedEntityDetail(game, kind, id);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(detail);
}
