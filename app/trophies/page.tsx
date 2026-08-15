import { trophyShowcase } from "../../lib/site/queries.ts";
import { Nav, Card, Money, Empty } from "../components.tsx";

export const dynamic = "force-dynamic";

// T11 — a showcase, not a shop. Nothing is for sale, there is no CP and there
// is no purchase. T3 — the participation trophy shows ONCE, with a holder
// count, never one row per gamer.
export default async function TrophiesPage() {
  const rows = await trophyShowcase();
  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Trophies</h1>
          <p className="mt-2 text-mute">
            Every trophy on the platform, what it is worth, and who holds it.
            Nothing here is for sale.
          </p>
        </div>
        {rows.length === 0 ? (
          <Empty>No trophies have been created yet.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {rows.map(({ trophy, holders }) => (
              <Card key={trophy.id} href={`/trophies/${trophy.id}`}>
                <p className="font-medium">{trophy.name}</p>
                <p className="mt-1 text-sm text-mute">
                  {trophy.valueCents > 0 ? <Money cents={trophy.valueCents} /> : "Collectable"}
                </p>
                <p className="mt-3 text-sm tabular-nums text-mute">
                  {holders} holder{holders === 1 ? "" : "s"}
                </p>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
