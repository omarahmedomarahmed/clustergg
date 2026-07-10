import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { saveSpace, adminDeletePost, togglePinPost } from "@/app/actions/admin";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Spaces" };

export default async function AdminSpacesPage() {
  const db = await getDb();
  const [spaces, recentPosts] = await Promise.all([
    db.select().from(schema.spaces),
    db.select({ post: schema.posts, author: schema.users, space: schema.spaces })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
      .innerJoin(schema.spaces, eq(schema.posts.spaceId, schema.spaces.id))
      .where(sql`${schema.posts.deletedAt} IS NULL`)
      .orderBy(desc(schema.posts.createdAt))
      .limit(20),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-6">Spaces</h1>
        <div className="glass p-6 mb-6">
          <h2 className="font-bold mb-4">Create space</h2>
          <form action={saveSpace} className="grid sm:grid-cols-2 gap-3">
            <input name="name" required placeholder="Name" className="input-cosmic" />
            <input name="game" placeholder="Game (optional, ties to leaderboards)" className="input-cosmic" />
            <input name="coverEmoji" placeholder="Emoji (default 🌌)" className="input-cosmic" />
            <input name="description" placeholder="Description" className="input-cosmic" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked className="accent-violet-500" /> Active</label>
            <div><button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Create</button></div>
          </form>
        </div>
        <div className="glass overflow-x-auto">
          <table className="w-full table-cosmic">
            <thead><tr><th>Space</th><th>Game</th><th>Members</th><th>Posts</th><th>Active</th></tr></thead>
            <tbody>
              {spaces.map((s) => (
                <tr key={s.id}>
                  <td><Link href={`/spaces/${s.slug}`} className="font-semibold text-sm hover:text-cyan-300">{s.coverEmoji} {s.name}</Link></td>
                  <td className="text-sm text-muted">{s.game ?? "—"}</td>
                  <td className="text-sm">{s.memberCount}</td>
                  <td className="text-sm">{s.postCount}</td>
                  <td className="text-sm">{s.isActive ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">Moderation queue — recent posts</h2>
        <div className="space-y-2">
          {recentPosts.map(({ post, author, space }) => (
            <div key={post.id} className="glass p-4 flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted mb-1">
                  {author.displayName} in {space.coverEmoji} {space.name} · {timeAgo(post.createdAt)}
                  {post.isPinned && <span className="text-amber-300"> · 📌 pinned</span>}
                </div>
                <p className="text-sm line-clamp-2">{post.body}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <form action={togglePinPost.bind(null, post.id, !post.isPinned, "/admin/spaces")}>
                  <button className="text-xs ghost-btn rounded-full px-3 py-1">{post.isPinned ? "Unpin" : "Pin"}</button>
                </form>
                <form action={adminDeletePost.bind(null, post.id)}>
                  <button className="text-xs rounded-full px-3 py-1 border border-rose-400/40 text-rose-300">Delete</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
