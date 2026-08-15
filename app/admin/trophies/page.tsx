import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../../lib/db/index.ts";
import { formatMoney } from "../../../lib/money/amounts.ts";
import { Panel, Empty } from "../components.tsx";

export const dynamic = "force-dynamic";

export default async function AdminTrophies() {
  const db = await getDb();
  const rows = await db
    .select({
      trophy: schema.trophies,
      holders: sql<number>`count(${schema.userTrophies.id})::int`,
    })
    .from(schema.trophies)
    .leftJoin(schema.userTrophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
    .groupBy(schema.trophies.id)
    .orderBy(desc(schema.trophies.valueCents));

  const byType = (type: string) => rows.filter((r) => r.trophy.type === type);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Trophies</h1>
      <p className="text-sm text-mute">
        A trophy&rsquo;s value is set once and never changes. Name, image and
        brand are editable forever, and an edit reaches every holder — they
        point at the definition rather than copying it.
      </p>

      {(["podium", "participation", "milestone"] as const).map((type) => (
        <Panel key={type} title={`${type} — ${byType(type).length}`}>
          {byType(type).length === 0 ? (
            <Empty>None yet.</Empty>
          ) : (
            <div className="flex flex-col">
              {byType(type).map(({ trophy, holders }) => (
                <div
                  key={trophy.id}
                  className="flex items-center justify-between border-b border-line py-3 last:border-0"
                >
                  <Link href={`/trophies/${trophy.id}`} className="text-sm hover:underline">
                    {trophy.name}
                  </Link>
                  <span className="flex items-center gap-6 text-sm">
                    <span className="text-xs text-mute">
                      {holders} holder{holders === 1 ? "" : "s"}
                    </span>
                    <span className="tabular-nums">
                      {trophy.valueCents > 0 ? formatMoney(trophy.valueCents) : "Collectable"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}
