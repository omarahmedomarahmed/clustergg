import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { gameHasDirectory } from "@/lib/game-entities";
import { entityKindsForGame } from "@/lib/hero-layout";
import { getCachedEntityList } from "@/lib/game-world-cache";
import { loadOverrideMap } from "@/lib/game-overrides";
import GameWorldEditor from "@/components/GameWorldEditor";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Game worlds" };

export default async function GameWorldsAdminPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  const db = await getDb();
  const activeGames = await db.select({ name: schema.games.name }).from(schema.games).where(eq(schema.games.isActive, true));
  const games = [...new Set(activeGames.map((g) => g.name))].filter(gameHasDirectory).sort();
  const sp = await searchParams;
  const game = sp.game && games.includes(sp.game) ? sp.game : games[0] ?? "";

  return (
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2"><Icon name="swords" size={20} className="text-violet-300" /> Game worlds</h1>
      <p className="text-sm text-muted mt-1 mb-6">
        Manage every champion, legend, agent, weapon and map a planet shows — edit their name, role, art, lore and skins,
        hide the ones you don&apos;t want, reorder them, or add your own (e.g. PUBG heroes). Blank fields keep the game&apos;s
        default data; anything you set overrides it everywhere it appears.
      </p>
      {!game ? (
        <div className="glass p-8 text-center text-sm text-muted">No games with a world catalogue are active yet.</div>
      ) : (
        <GameWorldEditorLoader game={game} games={games} />
      )}
    </div>
  );
}

async function GameWorldEditorLoader({ game, games }: { game: string; games: string[] }) {
  const [entities, ov] = await Promise.all([getCachedEntityList(game), loadOverrideMap(game)]);
  const overridden = [...ov.values()].map((o) => `${o.kind}:${o.entityId}`);
  const hiddenKeys = [...ov.values()].filter((o) => o.hidden).map((o) => `${o.kind}:${o.entityId}`);
  const kinds = entityKindsForGame(game);
  return (
    <GameWorldEditor
      game={game} games={games} entities={entities}
      overridden={overridden} hiddenKeys={hiddenKeys}
      kinds={kinds.length ? kinds : ["champion"]}
    />
  );
}
