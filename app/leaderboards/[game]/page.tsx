import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

// Leaderboards are now part of each game's planet.
export default async function GameLeaderboardRedirect({
  params, searchParams,
}: {
  params: Promise<{ game: string }>;
  searchParams: Promise<{ stat?: string }>;
}) {
  const { game } = await params;
  const { stat } = await searchParams;
  const name = decodeURIComponent(game);
  const db = await getDb();
  const [space] = await db.select().from(schema.spaces)
    .where(and(eq(schema.spaces.game, name), eq(schema.spaces.isActive, true))).limit(1);
  const q = stat ? `?stat=${encodeURIComponent(stat)}` : "";
  redirect(space ? `/planets/${space.slug}${q}` : "/planets");
}
