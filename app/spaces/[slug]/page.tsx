import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import PostCard from "@/components/PostCard";
import AdSlot from "@/components/AdSlot";
import JoinSpaceButton from "@/components/JoinSpaceButton";
import { createPost } from "@/app/actions/social";
import Icon from "@/components/Icon";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SpacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDb();
  const [space] = await db.select().from(schema.spaces).where(eq(schema.spaces.slug, slug)).limit(1);
  if (!space || !space.isActive) notFound();

  const viewer = await getCurrentUser();
  const [posts, membership, activeChallenges, expertRows] = await Promise.all([
    db.select({ post: schema.posts, author: schema.users })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
      .where(and(eq(schema.posts.spaceId, space.id), sql`${schema.posts.deletedAt} IS NULL`))
      .orderBy(desc(schema.posts.isPinned), desc(schema.posts.createdAt))
      .limit(30),
    viewer
      ? db.select().from(schema.spaceMembers).where(and(
          eq(schema.spaceMembers.spaceId, space.id), eq(schema.spaceMembers.userId, viewer.id))).limit(1)
      : Promise.resolve([]),
    db.select().from(schema.challenges).where(and(
      eq(schema.challenges.spaceId, space.id), eq(schema.challenges.status, "active"))),
    db.select().from(schema.spaceExpertScores).where(eq(schema.spaceExpertScores.spaceId, space.id)),
  ]);
  const tierByUser = new Map(expertRows.map((r) => [r.userId, r.tier]));
  const path = `/spaces/${space.slug}`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* Header */}
      <div className="glass relative overflow-hidden p-6 md:p-8 mb-6">
        <div className="absolute inset-0 opacity-25 bg-cover bg-center" style={{ backgroundImage: "url(/assets/ambient.png)" }} />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-600/30 to-cyan-600/20 shrink-0"><Icon name="users" size={30} className="text-violet-200" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl md:text-3xl font-bold">{space.name}</h1>
            <p className="text-muted text-sm mt-1">{space.description}</p>
            <div className="flex gap-4 mt-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><Icon name="users" size={12} /> {space.memberCount} members</span>
              <span className="inline-flex items-center gap-1.5"><Icon name="message" size={12} /> {space.postCount} posts</span>
            </div>
          </div>
          {viewer && <JoinSpaceButton spaceId={space.id} isMember={membership.length > 0} path={path} />}
        </div>
      </div>

      {/* Pinned challenge banner */}
      {activeChallenges.map((c) => (
        <Link
          key={c.id}
          href={`/spaces/${space.slug}/challenges/${c.id}`}
          className="glass card-lift mb-6 flex flex-wrap items-center gap-4 p-5 !border-cyan-400/40"
        >
          <Icon name="zap" size={28} className="text-amber-300 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-cyan-300">Live challenge · ends {timeAgo(c.endAt).replace(" ago", "")}</div>
            <div className="font-bold">{c.title}</div>
            <div className="text-xs text-muted truncate">{c.prizeDescription}</div>
          </div>
          <span className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white">Compete</span>
        </Link>
      ))}

      {/* Composer */}
      {viewer ? (
        <form action={createPost.bind(null, space.id, space.slug)} className="glass p-4 mb-6">
          <textarea
            name="body" rows={3} required maxLength={5000}
            placeholder={`Transmit to ${space.name}…`}
            className="input-cosmic resize-none"
          />
          <div className="mt-3 flex justify-end">
            <button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Post</button>
          </div>
        </form>
      ) : (
        <div className="glass p-4 mb-6 text-center text-sm text-muted">
          <Link href="/login" className="text-cyan-300 underline">Log in</Link> to post in this space.
        </div>
      )}

      {/* Feed with inline ads every 6 posts */}
      <div className="space-y-4">
        {posts.length === 0 && (
          <div className="glass p-10 text-center text-muted">Silence in this sector… be the first to transmit.</div>
        )}
        {posts.map(({ post, author }, i) => (
          <div key={post.id}>
            <PostCard
              post={post} author={author} viewerId={viewer?.id ?? null}
              path={path} expertTier={tierByUser.get(author.id)}
            />
            {(i + 1) % 6 === 0 && i + 1 < posts.length && <div className="mt-4"><AdSlot placement="feed_inline" /></div>}
          </div>
        ))}
      </div>
    </div>
  );
}
