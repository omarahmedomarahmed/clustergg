import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import GameLogo from "@/components/GameLogo";
import Icon from "@/components/Icon";
import LeaderboardWidget from "@/components/LeaderboardWidget";
import { slimImg } from "@/lib/img";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaderboards" };

export default async function LeaderboardsPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  const { game } = await searchParams;
  const db = await getDb();
  const boards = await db.select().from(schema.leaderboards).where(eq(schema.leaderboards.isActive, true));

  if (boards.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold mb-3">Leaderboards</h1>
        <p className="text-muted">No leaderboards configured yet.</p>
      </div>
    );
  }

  const gameNames = [...new Set(boards.map((b) => b.game))];
  const gameRows = await db.select({ name: schema.games.name, slug: schema.games.slug, logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl })
    .from(schema.games).where(and(inArray(schema.games.name, gameNames), eq(schema.games.isActive, true))).orderBy(asc(schema.games.sortOrder));
  // Games without a catalog row still get a toggle (logo-less).
  const games = gameNames.map((n) => gameRows.find((g) => g.name === n) ?? { name: n, slug: null as string | null, logoUrl: null as string | null, coverUrl: null as string | null });

  const selectedName = game && gameNames.includes(game) ? game : games[0].name;
  const selected = games.find((g) => g.name === selectedName)!;
  const gameBoards = boards.filter((b) => b.game === selectedName);
  const cover = slimImg(selected.coverUrl ?? null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="text-center mb-6">
        <h1 className="text-3xl md:text-4xl font-bold">Galaxy <span className="grad-text">Leaderboards</span></h1>
        <p className="text-muted mt-2">Real, API-verified rankings across every game. Pick a planet.</p>
      </div>

      {/* Game toggle — logos */}
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {games.map((g) => {
          const active = g.name === selectedName;
          return (
            <Link key={g.name} href={`/leaderboards?game=${encodeURIComponent(g.name)}`} scroll={false}
              className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-1.5 transition-all ${active ? "border-cyan-400/60 bg-cyan-400/10 scale-105" : "border-violet-400/20 opacity-70 hover:opacity-100"}`}>
              {g.logoUrl ? <GameLogo logoUrl={slimImg(g.logoUrl)} name={g.name} size={26} rounded="rounded-lg" /> : <Icon name="gamepad" size={16} className="text-violet-300" />}
              <span className="text-sm font-semibold">{g.name}</span>
            </Link>
          );
        })}
      </div>

      {/* Boards over the game's cover background */}
      <div className="relative rounded-3xl overflow-hidden border border-white/10 p-5 md:p-7">
        {cover ? (
          <div aria-hidden className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${cover})` }} />
        ) : (
          <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: "url(/assets/ambient.png)" }} />
        )}
        <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(4,5,26,0.86), rgba(4,5,26,0.94))" }} />

        <div className="relative">
          <div className="flex items-center gap-3 mb-5">
            {selected.logoUrl && <GameLogo logoUrl={slimImg(selected.logoUrl)} name={selected.name} size={40} rounded="rounded-xl" />}
            <h2 className="text-xl font-bold">{selected.name} leaderboards</h2>
            {selected.slug && <Link href={`/planets/${selected.slug}`} className="ml-auto text-xs text-cyan-300 hover:underline">Visit planet →</Link>}
          </div>

          {/* All this game's boards, side by side */}
          <div className="grid lg:grid-cols-2 gap-5">
            {gameBoards.map((b) => (
              <div key={b.id} className="rounded-2xl border border-white/10 bg-[#04051a]/60 p-4">
                <div className="font-bold text-sm mb-3 flex items-center gap-2"><Icon name="chart" size={15} className="text-cyan-300" /> {b.title}</div>
                <LeaderboardWidget boards={[b]} basePath="/leaderboards" limit={10} compact />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
