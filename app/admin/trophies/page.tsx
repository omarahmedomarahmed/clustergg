import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../../lib/db/index.ts";
import { formatMoney } from "../../../lib/money/amounts.ts";
import { Panel, Empty } from "../components.tsx";
import { editTrophyAction } from "../actions.ts";

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
                  {/*
                    The editor the paragraph above has been promising. `editTrophy`
                    had no caller, so "name, image and brand are editable forever"
                    was true of the function and of nothing a human could reach.

                    No value field, and there never will be one: T8 — a $100
                    trophy is a $100 trophy forever, because the prize vault is
                    holding exactly that much against it.
                  */}
                  <form action={editTrophyAction} className="flex flex-1 items-center gap-2">
                    <input type="hidden" name="trophyId" value={trophy.id} />
                    <input
                      name="name"
                      defaultValue={trophy.name}
                      className="w-48 rounded-md border border-line bg-ink px-2 py-1 text-sm"
                      data-testid="trophy-name"
                    />
                    <input
                      name="imageUrl"
                      defaultValue={trophy.imageUrl ?? ""}
                      placeholder="image URL"
                      className="w-48 rounded-md border border-line bg-ink px-2 py-1 text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-line px-2 py-1 text-xs hover:bg-white/5"
                      data-testid="trophy-save"
                    >
                      Save
                    </button>
                  </form>
                  <span className="flex items-center gap-6 text-sm">
                    <Link href={`/trophies/${trophy.id}`} className="text-xs text-mute hover:underline">
                      view
                    </Link>
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
