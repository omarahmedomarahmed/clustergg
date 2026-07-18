import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { saveSpace, deleteSpace, ensurePlanetsForGames, deleteLegacyPlanets, adminDeletePost, togglePinPost } from "@/app/actions/admin";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Planets" };

function PlanetForm({ planet, games }: { planet?: typeof schema.spaces.$inferSelect; games: { name: string; logoUrl: string | null }[] }) {
  return (
    <form action={saveSpace} className="grid sm:grid-cols-2 gap-3">
      {planet && <input type="hidden" name="spaceId" value={planet.id} />}
      <input name="name" required defaultValue={planet?.name} placeholder="Planet name" className="input-cosmic" />
      <select name="game" defaultValue={planet?.game ?? ""} className="input-cosmic">
        <option value="">— pick a game —</option>
        {games.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
      </select>
      <input name="description" defaultValue={planet?.description} placeholder="Description" className="input-cosmic sm:col-span-2" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={planet?.isActive ?? true} className="accent-violet-500" /> Active</label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">{planet ? "Save planet" : "Create planet"}</button>
      </div>
    </form>
  );
}

export default async function AdminPlanetsPage() {
  const db = await getDb();
  const [spaces, games, recentPosts] = await Promise.all([
    db.select().from(schema.spaces).orderBy(asc(schema.spaces.name)),
    db.select({ name: schema.games.name, logoUrl: schema.games.logoUrl }).from(schema.games).where(eq(schema.games.isActive, true)).orderBy(asc(schema.games.sortOrder)),
    db.select({ post: schema.posts, author: schema.users, space: schema.spaces })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
      .innerJoin(schema.spaces, eq(schema.posts.spaceId, schema.spaces.id))
      .where(sql`${schema.posts.deletedAt} IS NULL`)
      .orderBy(desc(schema.posts.createdAt)).limit(20),
  ]);
  const logoByGame = new Map(games.map((g) => [g.name, g.logoUrl]));
  const legacy = spaces.filter((s) => !s.game);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Planets</h1>
        <p className="text-sm text-muted mb-5">Every game is a planet. Create planets only for catalog games; edit any planet inline. Planet globe art &amp; region pins live on each game in the Games catalog.</p>

        <div className="flex flex-wrap gap-2 mb-5">
          <form action={ensurePlanetsForGames}>
            <button className="ghost-btn pressable rounded-full px-4 py-2 text-sm inline-flex items-center gap-1.5"><Icon name="planet" size={14} /> Create planets for all games</button>
          </form>
          {legacy.length > 0 && (
            <form action={deleteLegacyPlanets}>
              <button className="pressable rounded-full px-4 py-2 text-sm inline-flex items-center gap-1.5 border border-rose-400/40 text-rose-300"><Icon name="x" size={14} /> Delete {legacy.length} legacy (no-game) planet{legacy.length === 1 ? "" : "s"}</button>
            </form>
          )}
        </div>

        <details className="glass p-6 mb-6 group">
          <summary className="font-bold cursor-pointer list-none flex items-center gap-2">
            <Icon name="spark" size={16} className="text-cyan-300" /> Create a planet
            <span className="ml-auto text-xs text-muted group-open:hidden">Open form</span>
          </summary>
          <div className="mt-4 border-t border-violet-400/15 pt-4"><PlanetForm games={games} /></div>
        </details>

        <div className="text-xs uppercase tracking-widest text-muted mb-3">{spaces.length} planets</div>
        <div className="space-y-3">
          {spaces.map((s) => (
            <details key={s.id} className={`glass overflow-hidden ${!s.game ? "border !border-rose-400/30" : ""}`}>
              <summary className="flex items-center gap-3 p-4 cursor-pointer list-none">
                {s.game ? <GameLogo logoUrl={logoByGame.get(s.game) ?? null} name={s.name} size={38} rounded="rounded-lg" /> : <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-400/30"><Icon name="planet" size={16} className="text-rose-300" /></span>}
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm">{s.name} {!s.isActive && <span className="text-xs text-rose-300">(hidden)</span>}</div>
                  <div className="text-xs text-muted truncate">{s.game ? s.game : "⚠ legacy — not tied to a game"} · {s.memberCount} members · {s.postCount} posts</div>
                </div>
                <span className="text-xs text-cyan-300">Edit</span>
              </summary>
              <div className="border-t border-violet-400/15 p-5 space-y-3">
                <PlanetForm planet={s} games={games} />
                <div className="flex items-center gap-4 pt-1">
                  <Link href={`/planets/${s.slug}`} className="text-xs text-cyan-300 hover:underline">View planet →</Link>
                  {s.game && <Link href="/admin/games" className="text-xs text-cyan-300 hover:underline">Globe art &amp; pins (Games) →</Link>}
                  <form action={deleteSpace.bind(null, s.id)}>
                    <button className="text-xs text-rose-300 hover:underline">Delete planet</button>
                  </form>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">Moderation queue — recent posts</h2>
        <div className="space-y-2">
          {recentPosts.map(({ post, author, space }) => (
            <div key={post.id} className="glass p-4 flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted mb-1">
                  {author.displayName} in {space.name} · {timeAgo(post.createdAt)}
                  {post.isPinned && <span className="text-amber-300"> · pinned</span>}
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
