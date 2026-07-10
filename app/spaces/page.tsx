import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Spaces" };

export default async function SpacesDirectory() {
  const db = await getDb();
  const user = await getCurrentUser();
  const spaces = await db.select().from(schema.spaces).where(eq(schema.spaces.isActive, true));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <h1 className="text-3xl font-bold">Community <span className="grad-text">Spaces</span></h1>
        {user && (
          <Link href="/spaces/request-new" className="ghost-btn rounded-full px-5 py-2 text-sm">
            Request a new space
          </Link>
        )}
      </div>
      <p className="text-muted max-w-xl mb-10">
        Game-specific nebulae where the community gathers — posts, challenges, and expert ranks.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {spaces.map((s) => (
          <Link key={s.id} href={`/spaces/${s.slug}`} className="glass glass-hover p-6 flex flex-col">
            <div className="text-4xl">{s.coverEmoji}</div>
            <h2 className="font-bold text-lg mt-3">{s.name}</h2>
            <p className="text-sm text-muted mt-1 flex-1">{s.description}</p>
            <div className="mt-4 flex gap-4 text-xs text-muted">
              <span>👥 {s.memberCount} members</span>
              <span>💬 {s.postCount} posts</span>
              {s.game && <span className="ml-auto text-cyan-300">{s.game}</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
