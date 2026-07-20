import { NextRequest, NextResponse } from "next/server";
import { getCachedEntityList } from "@/lib/game-world-cache";

export const dynamic = "force-dynamic";

// The game-world catalogue (champions / agents+weapons / heroes) for a game's
// planet directory. Served from our Blob snapshot when synced, else live.
export async function GET(req: NextRequest) {
  const game = String(req.nextUrl.searchParams.get("game") ?? "");
  if (!game) return NextResponse.json({ entities: [] });
  const entities = await getCachedEntityList(game);
  return NextResponse.json({ game, entities });
}
