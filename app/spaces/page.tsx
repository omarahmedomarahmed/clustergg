import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import GameLogo from "@/components/GameLogo";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Spaces" };

export default async function SpacesDirectory() {
  const db = await getDb();
  const user = await getCurrentUser();
  const spaces = await db.select().from(schema.spaces).where(eq(schema.spaces.isActive, true));
  const gameNames = spaces.map((s) => s.game).filter((g): g is string => !!g);
  const gameRows = gameNames.length
    ? await db.select().from(schema.games).where(inArray(schema.games.name, gameNames))
    : [];
  const gameByName = new Map(gameRows.map((g) => [g.name, g]));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <h1 className="text-3xl font-bold">Community <span className="grad-text">Spaces</span></h1>
        {user && (
          <Link href="/spaces/request-new" className="ghost-btn pressable rounded-full px-5 py-2 text-sm">
            Request a new space
          </Link>
        )}
      </div>
      <p className="text-muted max-w-xl mb-10">
        Game-specific nebulae where the community gathers — posts, challenges, and expert ranks.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {spaces.map((s) => {
          const g = s.game ? gameByName.get(s.game) : undefined;
          return (
            <Link key={s.id} href={`/spaces/${s.slug}`} className="glass card-lift p-6 flex flex-col">
              <div className="flex items-center gap-3">
                {g ? (
                  <GameLogo logoUrl={g.logoUrl} name={s.name} size={48} />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-violet-400/25 bg-gradient-to-br from-violet-600/30 to-fuchsia-600/20">
                    <Icon name="users" size={22} className="text-violet-200" />
                  </div>
                )}
                <h2 className="font-bold text-lg">{s.name}</h2>
              </div>
              <p className="text-sm text-muted mt-3 flex-1">{s.description}</p>
              <div className="mt-4 flex gap-4 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5"><Icon name="users" size={13} /> {s.memberCount} members</span>
                <span className="inline-flex items-center gap-1.5"><Icon name="message" size={13} /> {s.postCount} posts</span>
                {s.game && <span className="ml-auto text-cyan-300">{s.game}</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
