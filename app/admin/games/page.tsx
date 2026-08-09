import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  saveGame, deleteGame, saveSpace, deleteSpace, ensurePlanetsForGames, deleteLegacyPlanets,
} from "@/app/actions/admin";
import SocialPurgePanel from "@/components/SocialPurgePanel";
import { socialRowCounts } from "@/lib/social-purge";
import GameLogo from "@/components/GameLogo";
import ImageUpload from "@/components/ImageUpload";
import CoverFramer from "@/components/CoverFramer";
import GameMetricsEditor from "@/components/GameMetricsEditor";
import SubmitButton from "@/components/SubmitButton";
import Icon from "@/components/Icon";
import { optImg } from "@/lib/img";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Games & planets" };

// A game and its planet are one thing, edited in one place.
//
// They used to be two pages. The Games catalog edited the planet's art, theme
// and hero layout; the Planets page edited the planet's name, description and
// visibility — and neither could edit the other, so changing "League of
// Legends" meant knowing which half of it lived where. Worse, the Planets page
// linked BACK to Games for the globe art, which is a page telling you it isn't
// the right page.
//
// So: one row per game, holding both. The planet panel sits inside the game it
// belongs to, and a game with no planet yet says so and offers to make one.
// Legacy planets — rows from before a planet meant a game — get their own
// section at the bottom, because they are a cleanup job and not a game.

function GameForm({ game }: { game?: typeof schema.games.$inferSelect }) {
  return (
    <form action={saveGame} className="grid gap-3 sm:grid-cols-2">
      {game && <input type="hidden" name="gameId" value={game.id} />}
      <input name="name" required defaultValue={game?.name} placeholder="Game name" className="input-cosmic" />
      <input name="sortOrder" type="number" defaultValue={game?.sortOrder ?? 0} placeholder="Sort order" className="input-cosmic" />
      <input name="description" defaultValue={game?.description} placeholder="Description" className="input-cosmic sm:col-span-2" />
      <ImageUpload name="logoUrl" defaultValue={game?.logoUrl ?? ""} label="Logo (square)" aspect="1/1" rounded="rounded-lg" maxDim={256} quality={0.8} scope="game" hint="Square game logo — shown in nav, cards and leaderboards." />
      <ImageUpload name="planetImageUrl" defaultValue={game?.planetImageUrl ?? ""} label="Planet skin (interactive hero)" aspect="1/1" rounded="rounded-full" maxDim={1024} scope="game" hint="Square planet render. When set, the game's planet page shows the interactive globe hero." />
      <ImageUpload name="planetBgUrl" defaultValue={game?.planetBgUrl ?? ""} label="Planet space background" aspect="16/9" maxDim={1600} scope="game" hint="Wide themed space art shown behind the globe." />
      <div className="sm:col-span-2">
        <CoverFramer name="coverUrl" defaultUrl={game?.coverUrl ?? ""} defaultAdjust={game?.coverAdjust} maxDim={1200}
          hint="Drag the image to reposition and use the zoom slider — the frame is exactly how it appears on the planet header." />
      </div>
      <GameMetricsEditor initial={game?.customMetrics ?? []} />
      <div className="grid gap-3 rounded-xl border border-violet-400/15 bg-black/20 p-3 sm:col-span-2 sm:grid-cols-3">
        <label className="text-xs text-muted">Accent color
          <input type="color" name="accent" defaultValue={game?.accent ?? "#8b5cf6"} className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-violet-400/25 bg-transparent p-0.5" />
        </label>
        <label className="text-xs text-muted">Secondary accent
          <input type="color" name="accent2" defaultValue={game?.accent2 ?? "#22d3ee"} className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-violet-400/25 bg-transparent p-0.5" />
        </label>
        <label className="text-xs text-muted">Hero layout
          <select name="planetLayout" defaultValue={game?.planetLayout ?? "auto"} className="input-cosmic mt-1">
            <option value="auto">Auto (globe if skin set)</option>
            <option value="globe">Interactive globe</option>
            <option value="cover">Cover banner</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4 pt-1 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="showInNav" defaultChecked={game?.showInNav ?? false} className="accent-cyan-500" /> Show logo in nav
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={game?.isActive ?? true} className="accent-violet-500" /> Active
        </label>
      </div>
      <div className="sm:col-span-2">
        <SubmitButton className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white">
          {game ? "Save game" : "Add game"}
        </SubmitButton>
      </div>
    </form>
  );
}

function PlanetForm({ planet, gameName, games }: {
  planet?: typeof schema.spaces.$inferSelect;
  /** Pre-selected when the form sits inside the game it belongs to. */
  gameName?: string;
  games: { name: string }[];
}) {
  return (
    <form action={saveSpace} className="grid gap-3 sm:grid-cols-2">
      {planet && <input type="hidden" name="spaceId" value={planet.id} />}
      <input name="name" required defaultValue={planet?.name ?? gameName} placeholder="Planet name" className="input-cosmic" />
      {gameName
        // Inside a game, the game is not a choice — it is which row you're in.
        ? <input type="hidden" name="game" value={gameName} />
        : (
          <select name="game" defaultValue={planet?.game ?? ""} className="input-cosmic">
            <option value="">— pick a game —</option>
            {games.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
        )}
      <input name="description" defaultValue={planet?.description} placeholder="Description" className={`input-cosmic ${gameName ? "sm:col-span-1" : "sm:col-span-2"}`} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={planet?.isActive ?? true} className="accent-violet-500" /> Visible
      </label>
      <div className="sm:col-span-2">
        <SubmitButton className="ghost-btn pressable rounded-full px-5 py-2 text-sm font-semibold">
          {planet ? "Save planet" : "Create planet"}
        </SubmitButton>
      </div>
    </form>
  );
}

export default async function AdminGamesPage() {
  const db = await getDb();
  const [games, planets, socialCounts] = await Promise.all([
    db.select().from(schema.games).orderBy(asc(schema.games.sortOrder)),
    db.select().from(schema.spaces).orderBy(asc(schema.spaces.name)),
    socialRowCounts(db),
  ]);

  const planetFor = new Map(planets.filter((p) => p.game).map((p) => [p.game as string, p]));
  const legacy = planets.filter((p) => !p.game);
  const missing = games.filter((g) => !planetFor.has(g.name));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="mb-1 text-2xl font-bold">Games &amp; planets</h1>
        <p className="mb-5 max-w-2xl text-sm text-muted">
          A game and its planet are the same thing, so they are edited in the same place. Open a game to
          set its art, theme and hero layout, and the planet it appears as underneath.
        </p>

        <div className="mb-5 flex flex-wrap gap-2">
          {missing.length > 0 && (
            <form action={ensurePlanetsForGames}>
              <SubmitButton className="ghost-btn pressable inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm">
                <Icon name="planet" size={14} /> Create the {missing.length} missing planet{missing.length === 1 ? "" : "s"}
              </SubmitButton>
            </form>
          )}
          <Link href="/admin/spaces/requests" className="ghost-btn pressable inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm">
            <Icon name="inbox" size={14} /> Games gamers have asked for
          </Link>
        </div>

        <details className="glass group mb-6 p-6">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-bold">
            <Icon name="spark" size={16} className="text-cyan-300" /> Add a new game
            <span className="ml-auto text-xs text-muted group-open:hidden">Open form</span>
          </summary>
          <div className="mt-4 border-t border-violet-400/15 pt-4"><GameForm /></div>
        </details>

        <div className="mb-3 text-xs uppercase tracking-widest text-muted">
          {games.length} games · {planets.length - legacy.length} planets
        </div>
        <div className="space-y-4">
          {games.map((g) => {
            const planet = planetFor.get(g.name);
            return (
              <details key={g.id} className="glass overflow-hidden">
                <summary className="flex cursor-pointer list-none items-center gap-4 p-4">
                  <GameLogo logoUrl={g.logoUrl} name={g.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">
                      {g.name} {!g.isActive && <span className="text-xs text-rose-300">(hidden)</span>}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {planet
                        ? <>planet <b className="text-ink/80">{planet.name}</b> · {planet.memberCount} members{planet.isActive ? "" : " · hidden"}</>
                        : <span className="text-amber-300">no planet yet</span>}
                      {g.description ? ` · ${g.description}` : ""}
                    </div>
                  </div>
                  <span className="text-xs text-cyan-300">Edit</span>
                </summary>
                <div className="space-y-5 border-t border-violet-400/15 p-5">
                  {g.coverUrl && (
                    <div className="h-24 overflow-hidden rounded-lg border border-violet-400/15">
                      <div className="h-full w-full bg-cover" style={{
                        backgroundImage: `url(${optImg(g.coverUrl, 1200)})`,
                        backgroundPosition: `${g.coverAdjust.x}% ${g.coverAdjust.y}%`,
                        transform: `scale(${g.coverAdjust.zoom})`,
                      }} />
                    </div>
                  )}
                  <GameForm game={g} />

                  {/* The planet, inside the game it is. */}
                  <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-200">
                      <Icon name="planet" size={13} /> Its planet
                    </div>
                    {planet ? (
                      <>
                        <PlanetForm planet={planet} gameName={g.name} games={games} />
                        <div className="mt-3 flex flex-wrap items-center gap-4">
                          <Link href={`/planets/${planet.slug}`} className="text-xs text-cyan-300 hover:underline">View it →</Link>
                          <Link href={`/admin/games/${g.id}/planet`} className="text-xs text-cyan-300 hover:underline">Globe art &amp; region pins →</Link>
                          <form action={deleteSpace.bind(null, planet.id)}>
                            <button className="text-xs text-rose-300 hover:underline">Delete planet</button>
                          </form>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="mb-3 text-xs text-muted">
                          This game has no planet, so it has no page, no leaderboards and nowhere for a
                          challenge to live. Creating one takes the game&apos;s name and art.
                        </p>
                        <PlanetForm gameName={g.name} games={games} />
                      </>
                    )}
                  </div>

                  <form action={deleteGame.bind(null, g.id)}>
                    <button className="text-xs text-rose-300 hover:underline">Delete game</button>
                  </form>
                </div>
              </details>
            );
          })}
        </div>
      </div>

      {/* Rows from before a planet meant a game. A cleanup job, not a game. */}
      {legacy.length > 0 && (
        <section>
          <h2 className="mb-1 text-xl font-bold">Planets with no game ({legacy.length})</h2>
          <p className="mb-4 max-w-2xl text-sm text-muted">
            Left over from when a planet could be anything. They have no stats behind them and nothing
            syncs into them — attach each to a game, or delete it.
          </p>
          <form action={deleteLegacyPlanets} className="mb-4">
            <SubmitButton className="pressable inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 px-4 py-2 text-sm text-rose-300">
              <Icon name="x" size={14} /> Delete all {legacy.length}
            </SubmitButton>
          </form>
          <div className="space-y-3">
            {legacy.map((s) => (
              <details key={s.id} className="glass overflow-hidden border !border-rose-400/30">
                <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-400/30">
                    <Icon name="planet" size={16} className="text-rose-300" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{s.name}</div>
                    <div className="truncate text-xs text-muted">{s.memberCount} members</div>
                  </div>
                  <span className="text-xs text-cyan-300">Fix</span>
                </summary>
                <div className="space-y-3 border-t border-violet-400/15 p-5">
                  <PlanetForm planet={s} games={games} />
                  <form action={deleteSpace.bind(null, s.id)}>
                    <button className="text-xs text-rose-300 hover:underline">Delete planet</button>
                  </form>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* B111. The moderation queue was here. Removing posts removed the only
          thing on this platform that needed moderating, which was most of the
          argument for removing them. What sits in its place is the one button
          the removal deliberately did not press. */}
      <SocialPurgePanel counts={socialCounts} />
    </div>
  );
}
