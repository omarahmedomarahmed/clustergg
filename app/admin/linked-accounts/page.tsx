// Every linked game account, and its sync health. **Admin only.**

import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../../lib/db/index.ts";
import { isProven } from "../../../lib/identity/accounts.ts";
import { Panel, Empty, Light } from "../components.tsx";

export const dynamic = "force-dynamic";

export default async function LinkedAccounts() {
  const db = await getDb();
  const rows = await db
    .select({ account: schema.linkedGameAccounts, user: schema.users })
    .from(schema.linkedGameAccounts)
    .leftJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
    .orderBy(desc(schema.linkedGameAccounts.createdAt))
    .limit(200);

  const unhealthy = rows.filter((r) => r.account.syncStatus !== "ok");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Linked accounts</h1>
        <p className="mt-1 text-sm text-mute" data-testid="admin-only-note">
          Admin only. No staff department reaches this list, ever.
        </p>
      </div>

      <Panel title={`${unhealthy.length} not syncing`}>
        {rows.length === 0 ? (
          <Empty>Nothing linked yet.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-mute">
              <tr className="border-b border-line">
                <th className="py-2 font-normal">Gamer</th>
                <th className="py-2 font-normal">Provider</th>
                <th className="py-2 font-normal">In-game name</th>
                <th className="py-2 font-normal">Ownership</th>
                <th className="py-2 font-normal">Sync</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ account, user }) => (
                <tr key={account.id} className="border-b border-line last:border-0">
                  <td className="py-2">{user?.displayName ?? "—"}</td>
                  <td className="py-2 text-mute">{account.provider}</td>
                  <td className="py-2 text-mute">{account.inGameName ?? "—"}</td>
                  <td className="py-2">
                    {/* C5 — never call an account verified without proof. An
                        account that merely EXISTS is not an account somebody
                        owns, and this column is where that distinction is
                        most likely to be blurred. */}
                    {isProven(account.verifiedMethod) ? (
                      <span className="text-green-400">proven · {account.verifiedMethod}</span>
                    ) : (
                      <span className="text-mute">unproven · {account.verifiedMethod}</span>
                    )}
                  </td>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <Light ok={account.syncStatus === "ok"} />
                      {account.syncStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
