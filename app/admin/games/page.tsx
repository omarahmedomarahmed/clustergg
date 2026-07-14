import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { saveGame, deleteGame } from "@/app/actions/admin";
import GameLogo from "@/components/GameLogo";
import ImageUpload from "@/components/ImageUpload";
import CoverFramer from "@/components/CoverFramer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Games" };

function GameForm({ game }: { game?: typeof schema.games.$inferSelect }) {
  return (
    <form action={saveGame} className="grid sm:grid-cols-2 gap-3">
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
      <div className="flex gap-4 sm:col-span-2 items-center flex-wrap pt-1">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="showInNav" defaultChecked={game?.showInNav ?? false} className="accent-cyan-500" /> Show logo in nav
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={game?.isActive ?? true} className="accent-violet-500" /> Active
        </label>
      </div>
      <div className="sm:col-span-2">
        <button className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white">
          {game ? "Save" : "Add game"}
        </button>
      </div>
    </form>
  );
}

export default async function AdminGamesPage() {
  const db = await getDb();
  const games = await db.select().from(schema.games).orderBy(asc(schema.games.sortOrder));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Games catalog</h1>
      <p className="text-sm text-muted mb-6">
        Logos, covers and framing shown across the site (homepage, planets, leaderboards).
        Upload images straight from your device — they&apos;re optimized automatically.
      </p>

      <div className="glass p-6 mb-8">
        <h2 className="font-bold mb-4">Add game</h2>
        <GameForm />
      </div>

      <div className="space-y-4">
        {games.map((g) => (
          <details key={g.id} className="glass overflow-hidden">
            <summary className="flex items-center gap-4 p-4 cursor-pointer list-none">
              <GameLogo logoUrl={g.logoUrl} name={g.name} size={44} />
              <div className="min-w-0 flex-1">
                <div className="font-bold">{g.name} {!g.isActive && <span className="text-xs text-rose-300">(hidden)</span>}</div>
                <div className="text-xs text-muted truncate">{g.description}</div>
              </div>
              <span className="text-xs text-cyan-300">Edit</span>
            </summary>
            <div className="border-t border-violet-400/15 p-5">
              {g.coverUrl && (
                <div className="mb-4 h-24 rounded-lg overflow-hidden border border-violet-400/15">
                  <div className="h-full w-full bg-cover" style={{
                    backgroundImage: `url(${g.coverUrl})`,
                    backgroundPosition: `${g.coverAdjust.x}% ${g.coverAdjust.y}%`,
                    transform: `scale(${g.coverAdjust.zoom})`,
                  }} />
                </div>
              )}
              <GameForm game={g} />
              <div className="mt-3 flex items-center gap-4">
                {g.planetImageUrl && (
                  <Link href={`/admin/games/${g.id}/planet`} className="text-xs text-cyan-300 hover:underline">Edit planet region pins →</Link>
                )}
                <form action={deleteGame.bind(null, g.id)}>
                  <button className="text-xs text-rose-300 hover:underline">Delete game</button>
                </form>
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
