// The gamer directory. **Admin only, and that has no exceptions.**
//
// House rule 7. The gate is in the layout, which reads `ROUTE_ACCESS` — this
// page does not check anything itself, because a page that checks is a page
// that can forget. What this page does is not show more than it has to: no
// email, no linked-account identifiers, no country beyond a code.

import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../../lib/db/index.ts";
import { Panel, Empty } from "../components.tsx";

export const dynamic = "force-dynamic";

export default async function Gamers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const db = await getDb();

  const rows = await db
    .select({
      user: schema.users,
      accounts: sql<number>`count(distinct ${schema.linkedGameAccounts.id})::int`,
      entries: sql<number>`count(distinct ${schema.challengeParticipants.id})::int`,
    })
    .from(schema.users)
    .leftJoin(
      schema.linkedGameAccounts,
      eq(schema.linkedGameAccounts.userId, schema.users.id),
    )
    .leftJoin(
      schema.challengeParticipants,
      eq(schema.challengeParticipants.userId, schema.users.id),
    )
    .where(query ? sql`lower(${schema.users.displayName}) like ${`%${query.toLowerCase()}%`}` : sql`true`)
    .groupBy(schema.users.id)
    .orderBy(desc(schema.users.createdAt))
    .limit(100);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gamers</h1>
        <p className="mt-1 text-sm text-mute" data-testid="admin-only-note">
          Admin only. No staff department reaches this list, ever.
        </p>
      </div>

      <Panel title={`${rows.length} shown`}>
        <form className="mb-4 flex gap-2">
          <input
            name="q"
            defaultValue={query}
            placeholder="Search by name"
            className="flex-1 rounded-lg border border-line bg-ink px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg border border-line px-4 py-2 text-sm hover:border-accent">
            Search
          </button>
        </form>
        {rows.length === 0 ? (
          <Empty>Nobody matches.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-mute">
              <tr className="border-b border-line">
                <th className="py-2 font-normal">Name</th>
                <th className="py-2 font-normal">Age band</th>
                <th className="py-2 font-normal">Country</th>
                <th className="py-2 font-normal">Accounts</th>
                <th className="py-2 font-normal">Entries</th>
                <th className="py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ user, accounts, entries }) => (
                <tr key={user.id} className="border-b border-line last:border-0">
                  <td className="py-2">
                    <Link href={`/u/${user.slug}`} className="hover:underline">
                      {user.displayName}
                    </Link>
                  </td>
                  <td className="py-2 text-mute">{user.ageBand ?? "—"}</td>
                  <td className="py-2 text-mute">{user.country ?? "—"}</td>
                  <td className="py-2 tabular-nums">{accounts}</td>
                  <td className="py-2 tabular-nums">{entries}</td>
                  <td className="py-2 text-mute">{user.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-4 text-xs text-mute">
          Age bands are changed by support only — a 13&ndash;17 gamer who turns
          18 must ask. They cannot change it themselves.
        </p>
      </Panel>
    </div>
  );
}
