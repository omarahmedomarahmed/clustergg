import Link from "next/link";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { PublicUser } from "@/lib/db/schema";
import Avatar from "@/components/Avatar";
import ReactionBar from "@/components/ReactionBar";
import CommentThread from "@/components/CommentThread";
import { timeAgo } from "@/lib/utils";
import Icon from "@/components/Icon";

type Post = typeof schema.posts.$inferSelect;
type User = PublicUser;

export default async function PostCard({
  post, author, viewerId, path, expertTier, spaceName,
}: {
  post: Post;
  author: User;
  viewerId: string | null;
  path: string;
  expertTier?: string | null;
  spaceName?: string;
}) {
  const db = await getDb();
  const [reactionRows, commentRows] = await Promise.all([
    db.select().from(schema.postReactions).where(eq(schema.postReactions.postId, post.id)),
    db.select({ comment: schema.comments, author: schema.publicUserColumns })
      .from(schema.comments)
      .innerJoin(schema.users, eq(schema.comments.authorId, schema.users.id))
      .where(and(eq(schema.comments.postId, post.id), sql`${schema.comments.deletedAt} IS NULL`))
      .orderBy(schema.comments.createdAt),
  ]);
  const counts: Record<string, number> = {};
  let mine: string | null = null;
  for (const r of reactionRows) {
    counts[r.reactionType] = (counts[r.reactionType] ?? 0) + 1;
    if (viewerId && r.userId === viewerId) mine = r.reactionType;
  }

  const tierBadge = expertTier === "expert" ? "Expert" : expertTier === "helper" ? "Helper" : expertTier === "contributor" ? "Contributor" : null;

  return (
    <article className="glass p-5">
      {post.isPinned && <div className="text-[10px] uppercase tracking-widest text-amber-300 mb-2 inline-flex items-center gap-1"><Icon name="pin" size={10} /> Pinned</div>}
      <div className="flex items-center gap-3">
        <Link href={`/u/${author.slug}`}><Avatar name={author.displayName} src={author.avatarUrl} size={38} /></Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/u/${author.slug}`} className="font-semibold hover:text-cyan-300">{author.displayName}</Link>
            {tierBadge && <span className="text-[10px] rounded-full border border-amber-400/40 text-amber-200 px-2 py-0.5 inline-flex items-center gap-1"><Icon name="star" size={9} /> {tierBadge}</span>}
          </div>
          <div className="text-xs text-muted">
            {spaceName && <>{spaceName} · </>}{timeAgo(post.createdAt)}
          </div>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{post.body}</p>
      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
        <ReactionBar postId={post.id} counts={counts} mine={mine} path={path} loggedIn={!!viewerId} />
        <span className="text-xs text-muted">{commentRows.length} comment{commentRows.length === 1 ? "" : "s"}</span>
      </div>
      <CommentThread postId={post.id} comments={commentRows} viewerId={viewerId} path={path} />
    </article>
  );
}
