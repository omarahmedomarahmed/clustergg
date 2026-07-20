import { NextRequest, NextResponse } from "next/server";
import { getEntityList } from "@/lib/game-entities";

export const dynamic = "force-dynamic";

// The game-world catalogue (champions / agents+weapons / heroes) for a game's
// planet directory. Public, cached upstream.
export async function GET(req: NextRequest) {
  const game = String(req.nextUrl.searchParams.get("game") ?? "");
  if (!game) return NextResponse.json({ entities: [] });
  const entities = await getEntityList(game);
  return NextResponse.json({ game, entities });
}
