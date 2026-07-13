import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

// A game's hub is now its "planet" (the game's community space).
export default async function GameRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDb();
  const [game] = await db.select().from(schema.games).where(eq(schema.games.slug, slug)).limit(1);
  if (!game) notFound();
  const [space] = await db.select().from(schema.spaces)
    .where(and(eq(schema.spaces.game, game.name), eq(schema.spaces.isActive, true))).limit(1);
  redirect(space ? `/planets/${space.slug}` : "/planets");
}
