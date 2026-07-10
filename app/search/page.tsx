import Link from "next/link";
import { desc, ilike, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import Avatar from "@/components/Avatar";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const db = await getDb();

  const [gamers, spaces, posts] = query
    ? await Promise.all([
        db.select().from(schema.users)
          .where(or(ilike(schema.users.displayName, `%${query}%`), ilike(schema.users.slug, `%${query}%`)))
          .limit(10),
        db.select().from(schema.spaces)
          .where(or(ilike(schema.spaces.name, `%${query}%`), ilike(schema.spaces.description, `%${query}%`)))
          .limit(6),
        db.select({ post: schema.posts, author: schema.users, space: schema.spaces })
          .from(schema.posts)
          .innerJoin(schema.users, sql`${schema.posts.authorId} = ${schema.users.id}`)
          .innerJoin(schema.spaces, sql`${schema.posts.spaceId} = ${schema.spaces.id}`)
          .where(ilike(schema.posts.body, `%${query}%`))
          .orderBy(desc(schema.posts.createdAt))
          .limit(10),
      ])
    : [[], [], []];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">Scan the <span className="grad-text">galaxy</span></h1>
      <form className="mb-10">
        <input
          name="q" defaultValue={query} autoFocus
          placeholder="Search gamers, spaces, posts…"
          className="input-cosmic text-lg !py-3.5"
        />
      </form>

      {query && (
        <div className="space-y-10">
          <section>
            <h2 className="text-sm uppercase tracking-widest text-muted mb-3">Gamers</h2>
            {gamers.length === 0 ? <p className="text-muted text-sm">No gamers found.</p> : (
              <div className="grid sm:grid-cols-2 gap-3">
                {gamers.map((g) => (
                  <Link key={g.id} href={`/u/${g.slug}`} className="glass glass-hover flex items-center gap-3 p-3">
                    <Avatar name={g.displayName} src={g.avatarUrl} size={40} />
                    <div className="min-w-0">
                      <div className="font-semibold">{g.displayName}</div>
                      <div className="text-xs text-muted truncate">@{g.slug}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
          <section>
            <h2 className="text-sm uppercase tracking-widest text-muted mb-3">Spaces</h2>
            {spaces.length === 0 ? <p className="text-muted text-sm">No spaces found.</p> : (
              <div className="grid sm:grid-cols-2 gap-3">
                {spaces.map((s) => (
                  <Link key={s.id} href={`/spaces/${s.slug}`} className="glass glass-hover flex items-center gap-3 p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-600/15 text-violet-200 text-sm font-bold shrink-0">{s.name.slice(0,1)}</div>
                    <div className="min-w-0">
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-xs text-muted truncate">{s.memberCount} members</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
          <section>
            <h2 className="text-sm uppercase tracking-widest text-muted mb-3">Posts</h2>
            {posts.length === 0 ? <p className="text-muted text-sm">No posts found.</p> : (
              <div className="space-y-3">
                {posts.map(({ post, author, space }) => (
                  <Link key={post.id} href={`/spaces/${space.slug}`} className="glass glass-hover block p-4">
                    <div className="text-xs text-muted mb-1">
                      {author.displayName} in {space.name} · {timeAgo(post.createdAt)}
                    </div>
                    <p className="text-sm line-clamp-2">{post.body}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
