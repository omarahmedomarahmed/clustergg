import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import GameLogo from "@/components/GameLogo";
import Icon from "@/components/Icon";
import LeaderboardWidget from "@/components/LeaderboardWidget";
import { getT } from "@/lib/i18n/t-server";
import { slimImg } from "@/lib/img";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaderboards" };

export default async function LeaderboardsPage({ searchParams }: { searchParams: Promise<{ game?: string; metric?: string }> }) {
  const { game, metric } = await searchParams;
  const db = await getDb();
  const boardsRaw = await db.select().from(schema.leaderboards).where(eq(schema.leaderboards.isActive, true));
  const { tr, te } = await getT();
  // Admin-translated board titles (falls back to the DB title per locale).
  const boards = boardsRaw.map((b) => ({ ...b, title: te("leaderboard", b.id, "title", b.title) }));

  if (boards.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold mb-3">{tr("Leaderboards")}</h1>
        <p className="text-muted">{tr("No leaderboards configured yet.")}</p>
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
  // Metric filter: narrow this game's boards to one metric (or "all").
  const selectedMetric = metric && gameBoards.some((b) => b.metricKey === metric) ? metric : "all";
  const shownBoards = selectedMetric === "all" ? gameBoards : gameBoards.filter((b) => b.metricKey === selectedMetric);
  const metricChip = (mKey: string, label: string) => {
    const on = selectedMetric === mKey;
    return (
      <Link key={mKey} href={`/leaderboards?game=${encodeURIComponent(selectedName)}${mKey === "all" ? "" : `&metric=${encodeURIComponent(mKey)}`}`} scroll={false}
        className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200" : "border-white/12 text-muted hover:text-ink"}`}>
        {label}
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="text-center mb-6">
        <h1 className="text-3xl md:text-4xl font-bold">{tr("Galaxy")} <span className="grad-text">{tr("Leaderboards")}</span></h1>
        <p className="text-muted mt-2">{tr("Real, API-verified rankings across every game. Pick a planet.")}</p>
      </div>

      {/* Game toggle — a horizontal-scroll strip on mobile (native rank-screen
          switcher), wrapping + centred from md up. */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 md:mb-8 md:flex-wrap md:justify-center md:overflow-visible [scrollbar-width:none]">
        {games.map((g) => {
          const active = g.name === selectedName;
          return (
            <Link key={g.name} href={`/leaderboards?game=${encodeURIComponent(g.name)}`} scroll={false}
              className={`shrink-0 inline-flex items-center gap-2 rounded-2xl border px-3 py-1.5 transition-all ${active ? "border-cyan-400/60 bg-cyan-400/10 scale-105" : "border-violet-400/20 opacity-70 hover:opacity-100"}`}>
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
          <div className="flex items-center gap-3 mb-4">
            {selected.logoUrl && <GameLogo logoUrl={slimImg(selected.logoUrl)} name={selected.name} size={40} rounded="rounded-xl" />}
            <h2 className="text-xl font-bold">{selected.name} {tr("leaderboards")}</h2>
            {selected.slug && <Link href={`/planets/${selected.slug}`} className="ml-auto text-xs text-cyan-300 hover:underline">{tr("Visit planet →")}</Link>}
          </div>

          {/* Metric filter — horizontal-scroll chips on mobile, wrapping on md+ */}
          {gameBoards.length > 1 && (
            <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1.5 md:flex-wrap md:overflow-visible [scrollbar-width:none]">
              {metricChip("all", `All metrics (${gameBoards.length})`)}
              {gameBoards.map((b) => metricChip(b.metricKey, b.title.split("·")[1]?.trim() ?? b.title))}
            </div>
          )}

          {/* Boards — full podium when a single metric is filtered, else the grid */}
          {selectedMetric !== "all" && shownBoards[0] ? (
            <div className="rounded-2xl border border-white/10 bg-[#04051a]/60 p-4 max-w-2xl mx-auto">
              <div className="font-bold text-sm mb-3 flex items-center gap-2"><Icon name="chart" size={15} className="text-cyan-300" /> {shownBoards[0].title}</div>
              <LeaderboardWidget boards={[shownBoards[0]]} basePath={`/leaderboards?game=${encodeURIComponent(selectedName)}`} limit={25} />
            </div>
          ) : (
            <div className="grid lg:grid-cols-2 gap-5">
              {shownBoards.map((b) => (
                <div key={b.id} className="rounded-2xl border border-white/10 bg-[#04051a]/60 p-4">
                  <div className="font-bold text-sm mb-3 flex items-center gap-2"><Icon name="chart" size={15} className="text-cyan-300" /> {b.title}</div>
                  <LeaderboardWidget boards={[b]} basePath="/leaderboards" limit={10} compact />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
