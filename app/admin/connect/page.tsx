import { getDb, schema } from "@/lib/db";
import { getContent } from "@/lib/cms";
import { connectableProviders } from "@/lib/providers/serialize";
import { isProviderLive } from "@/lib/providers/registry";
import { resolveGameLogo } from "@/lib/game-logos";
import ConnectVisibilityEditor from "@/components/ConnectVisibilityEditor";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Connect providers" };

export default async function AdminConnectPage() {
  const db = await getDb();
  const games = await db.select({ name: schema.games.name, slug: schema.games.slug, logoUrl: schema.games.logoUrl }).from(schema.games);
  const hidden = new Set((await getContent(["connect.hidden"]))["connect.hidden"].split(",").map((s) => s.trim()).filter(Boolean));

  const rows = connectableProviders().map((p) => ({
    id: p.id, name: p.name, game: p.game, live: isProviderLive(p),
    logoUrl: resolveGameLogo(games, p.game), hidden: hidden.has(p.id),
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Connect providers</h1>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Choose which games appear on the <b>Connect a game</b> picker (profile) and the onboarding
        flow. Unchecked providers are hidden everywhere gamers link accounts — existing links are
        never affected. Discord is always available as the universal identity.
      </p>
      <div className="glass p-6">
        <h2 className="font-bold mb-4 flex items-center gap-2"><Icon name="gamepad" size={16} className="text-cyan-300" /> Show on connect &amp; onboarding</h2>
        <ConnectVisibilityEditor rows={rows} />
      </div>
    </div>
  );
}
