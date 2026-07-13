import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import GameLogo from "@/components/GameLogo";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planets" };

// Every game — and every community — is a planet. Game planets lead with their
// cover; general planets get a cosmic tile.
export default async function PlanetsDirectory() {
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
        <h1 className="text-3xl font-bold">Explore <span className="grad-text">Planets</span></h1>
        {user && (
          <Link href="/spaces/request-new" className="ghost-btn pressable rounded-full px-5 py-2 text-sm">
            Request a new planet
          </Link>
        )}
      </div>
      <p className="text-muted max-w-xl mb-10">
        Each game has its own planet — leaderboards, challenges, players and a community feed, all in one world.
      </p>

      <AdSlot placement="games_top_banner" className="mb-10" />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {spaces.map((s) => {
          const g = s.game ? gameByName.get(s.game) : undefined;
          return (
            <Link key={s.id} href={`/planets/${s.slug}`} className="glass card-lift overflow-hidden flex flex-col group">
              <div className="h-28 relative overflow-hidden">
                {g?.coverUrl ? (
                  <div className="absolute inset-0 bg-cover transition-transform duration-500 group-hover:scale-110"
                    style={{ backgroundImage: `url(${g.coverUrl})`, backgroundPosition: `${g.coverAdjust.x}% ${g.coverAdjust.y}%` }} />
                ) : (
                  <div className="absolute inset-0 bg-cover" style={{ backgroundImage: "url(/assets/ambient.png)" }} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d26] via-[#0b0d26]/40 to-transparent" />
                <div className="absolute bottom-3 left-4 flex items-center gap-3">
                  {g ? (
                    <GameLogo logoUrl={g.logoUrl} name={s.name} size={44} />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-400/25 bg-gradient-to-br from-violet-600/40 to-fuchsia-600/30">
                      <Icon name="planet" size={20} className="text-violet-100" />
                    </div>
                  )}
                  <h2 className="font-bold text-lg drop-shadow">{s.name}</h2>
                </div>
              </div>
              <div className="p-5 flex flex-col flex-1">
                <p className="text-sm text-muted flex-1">{s.description}</p>
                <div className="mt-4 flex gap-4 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5"><Icon name="users" size={13} /> {s.memberCount}</span>
                  <span className="inline-flex items-center gap-1.5"><Icon name="message" size={13} /> {s.postCount}</span>
                  {s.game && <span className="ml-auto text-cyan-300">{s.game}</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
