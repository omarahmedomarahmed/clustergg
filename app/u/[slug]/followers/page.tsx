import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import UserList from "@/components/UserList";

export const dynamic = "force-dynamic";

export default async function FollowersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
  if (!user) notFound();
  const rows = await db.select({ u: schema.users })
    .from(schema.follows)
    .innerJoin(schema.users, eq(schema.follows.followerId, schema.users.id))
    .where(eq(schema.follows.followingId, user.id));
  return <UserList title={`Followers of ${user.displayName}`} users={rows.map((r) => r.u)} />;
}
