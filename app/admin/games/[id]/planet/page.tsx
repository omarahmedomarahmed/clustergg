import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { buildSkinnedPlanets } from "@/lib/planets";
import { REGIONS } from "@/lib/regions";
import PlanetPinEditor, { type EditablePin } from "@/components/PlanetPinEditor";
import PlanetArtForm from "@/components/PlanetArtForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Planet pins" };

export default async function AdminPlanetPinsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [game] = await db.select().from(schema.games).where(eq(schema.games.id, id)).limit(1);
  if (!game) notFound();

  const pinOverrides = (game.planetPins ?? {}) as Record<string, { x: number; y: number; color: string; label: string }>;

  // Prefer live region counts (from the same builder the hero uses); fall back
  // to defaults + saved overrides with zero counts when the game has no planet.
  const planets = game.planetImageUrl ? await buildSkinnedPlanets(db) : [];
  const planet = planets.find((p) => p.name === game.name);

  const pins: EditablePin[] = planet
    ? planet.regions.map((r) => ({ key: r.key, label: r.label, short: r.short, color: r.color, x: r.x, y: r.y, count: r.count }))
    : REGIONS.map((r) => {
        const o = pinOverrides[r.key];
        return { key: r.key, label: o?.label || r.label, short: r.short, color: o?.color || r.color, x: o?.x ?? r.x, y: o?.y ?? r.y, count: 0 };
      });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/games" className="text-xs text-cyan-300 hover:underline">← Games catalog</Link>
        <h1 className="text-2xl font-bold mt-1">{game.name} · planet pins</h1>
        <p className="text-sm text-muted mt-1">
          Align the six region markers to this planet&apos;s artwork. Gamer counts per region come
          automatically from linked accounts — you only place, name and color the pins.
        </p>
      </div>

      {/* Globe art — upload/replace the planet skin + its space background here. */}
      <div className="glass p-6">
        <h2 className="font-bold mb-3">Globe art</h2>
        <PlanetArtForm gameId={game.id} planetImageUrl={game.planetImageUrl} planetBgUrl={game.planetBgUrl} />
      </div>

      {game.planetImageUrl ? (
        <div className="glass p-6">
          <h2 className="font-bold mb-3">Region pins</h2>
          <PlanetPinEditor gameId={game.id} imageUrl={game.planetImageUrl} bgUrl={game.planetBgUrl} pins={pins} />
        </div>
      ) : (
        <div className="glass p-6 text-sm text-muted">
          Upload a <span className="text-cyan-300">Planet skin</span> above to unlock the interactive globe and its region pins.
        </div>
      )}
    </div>
  );
}
