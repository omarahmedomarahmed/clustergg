import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import PostCard from "@/components/PostCard";
import AdSlot from "@/components/AdSlot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feed" };

export default async function FeedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();

  const [mySpaces, myFollowing] = await Promise.all([
    db.select({ id: schema.spaceMembers.spaceId }).from(schema.spaceMembers)
      .where(eq(schema.spaceMembers.userId, user.id)),
    db.select({ id: schema.follows.followingId }).from(schema.follows)
      .where(eq(schema.follows.followerId, user.id)),
  ]);
  const spaceIds = mySpaces.map((s) => s.id);
  const followingIds = myFollowing.map((f) => f.id);

  const filters = [];
  if (spaceIds.length) filters.push(inArray(schema.posts.spaceId, spaceIds));
  if (followingIds.length) filters.push(inArray(schema.posts.authorId, followingIds));

  const posts = filters.length
    ? await db.select({ post: schema.posts, author: schema.users, space: schema.spaces })
        .from(schema.posts)
        .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
        .innerJoin(schema.spaces, eq(schema.posts.spaceId, schema.spaces.id))
        .where(and(sql`${schema.posts.deletedAt} IS NULL`, or(...filters)))
        .orderBy(desc(schema.posts.createdAt))
        .limit(30)
    : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold mb-4">Your <span className="grad-text">constellation feed</span></h1>
      <AdSlot placement="feed_top_banner" className="mb-6" />
      {posts.length === 0 ? (
        <div className="glass p-10 text-center text-muted">
          <p>Your feed is empty space.</p>
          <p className="mt-2 text-sm">
            <Link href="/spaces" className="text-cyan-300 underline">Join some spaces</Link> or{" "}
            <Link href="/search" className="text-cyan-300 underline">follow gamers</Link> to light it up.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(({ post, author, space }, i) => (
            <div key={post.id}>
              <PostCard
                post={post} author={author} viewerId={user.id}
                path="/feed" spaceName={space.name}
              />
              {(i + 1) % 6 === 0 && i + 1 < posts.length && <div className="mt-4"><AdSlot placement="feed_inline" /></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
