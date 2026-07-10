import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getContent } from "@/lib/cms";
import { PROVIDERS, isProviderLive } from "@/lib/providers/registry";
import GameLogo from "@/components/GameLogo";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Games" };

export default async function GamesPage() {
  const db = await getDb();
  const [games, c] = await Promise.all([
    db.select().from(schema.games).where(eq(schema.games.isActive, true)).orderBy(asc(schema.games.sortOrder)),
    getContent(["section.games.title", "section.games.subtitle", "banner.games"]),
  ]);

  const playerCounts = new Map<string, number>();
  for (const g of games) {
    const providerIds = PROVIDERS.filter((p) => p.game === g.name).map((p) => p.id);
    if (providerIds.length === 0) { playerCounts.set(g.id, 0); continue; }
    let total = 0;
    for (const pid of providerIds) {
      const [row] = await db.select({ c: count() }).from(schema.linkedGameAccounts)
        .where(eq(schema.linkedGameAccounts.provider, pid));
      total += Number(row?.c ?? 0);
    }
    playerCounts.set(g.id, total);
  }

  return (
    <div>
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-cover bg-center opacity-50" style={{ backgroundImage: `url(${c["banner.games"]})` }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#04051a]/40 via-[#04051a]/70 to-[#04051a]" />
        <div className="mx-auto max-w-6xl px-4 pt-16 pb-10">
          <h1 className="text-3xl md:text-5xl font-bold">{c["section.games.title"].split(" ")[0]} <span className="grad-text">{c["section.games.title"].split(" ").slice(1).join(" ") || "Galaxy"}</span></h1>
          <p className="text-muted mt-3 max-w-xl">{c["section.games.subtitle"]}</p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        <AdSlot placement="games_top_banner" className="mb-8" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 pb-16">
          {games.map((g) => {
            const live = PROVIDERS.some((p) => p.game === g.name && isProviderLive(p));
            const players = playerCounts.get(g.id) ?? 0;
            return (
              <Link key={g.id} href={`/games/${g.slug}`} className="glass card-lift overflow-hidden group">
                <div className="h-28 relative overflow-hidden">
                  <div
                    className="absolute inset-0 bg-cover transition-transform duration-500 group-hover:scale-110"
                    style={{
                      backgroundImage: `url(${g.coverUrl ?? c["banner.games"]})`,
                      backgroundPosition: `${g.coverAdjust.x}% ${g.coverAdjust.y}%`,
                      transform: `scale(${g.coverAdjust.zoom})`,
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d26] to-transparent" />
                  <div className="absolute bottom-3 left-4 flex items-center gap-3">
                    <GameLogo logoUrl={g.logoUrl} name={g.name} size={44} />
                    <div className="font-bold text-lg drop-shadow">{g.name}</div>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-sm text-muted line-clamp-2">{g.description}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                    <span className="inline-flex items-center gap-1.5"><Icon name="users" size={13} /> {players} linked</span>
                    <span className={`inline-flex items-center gap-1.5 ${live ? "text-emerald-300" : "text-amber-300/80"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400 animate-pulse" : "bg-amber-400/70"}`} />
                      {live ? "API live" : "Key ready"}
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1 text-cyan-300">Enter <Icon name="chevronRight" size={13} /></span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
