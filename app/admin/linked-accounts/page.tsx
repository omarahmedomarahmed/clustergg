import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { adminResyncAccount, adminUnlinkAccount } from "@/app/actions/admin";
import { getProvider, PROVIDERS, isProviderLive } from "@/lib/providers/registry";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Linked accounts" };

export default async function AdminLinkedAccountsPage() {
  const db = await getDb();
  const rows = await db.select({ a: schema.linkedGameAccounts, u: schema.users })
    .from(schema.linkedGameAccounts)
    .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
    .orderBy(desc(schema.linkedGameAccounts.createdAt))
    .limit(200);

  const errorCount = rows.filter((r) => r.a.syncStatus === "error").length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Linked accounts</h1>
      <p className="text-sm text-muted mb-6">
        {rows.length} accounts · {errorCount} in error ·{" "}
        {PROVIDERS.filter(isProviderLive).length}/{PROVIDERS.length} providers live
      </p>

      <div className="glass p-4 mb-6">
        <h2 className="text-sm font-bold mb-3">Provider status</h2>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((p) => (
            <span
              key={p.id}
              title={p.envVars.join(", ") || "public API"}
              className={`text-xs rounded-full px-2.5 py-1 border ${isProviderLive(p) ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/30 text-amber-300/80"}`}
            >
              {p.glyph} {p.name}
            </span>
          ))}
        </div>
      </div>

      <div className="glass overflow-x-auto">
        <table className="w-full table-cosmic min-w-[760px]">
          <thead>
            <tr><th>Account</th><th>Provider</th><th>Owner</th><th>Status</th><th>Last sync</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {rows.map(({ a, u }) => (
              <tr key={a.id}>
                <td className="font-semibold text-sm">{a.inGameName}</td>
                <td className="text-sm">{getProvider(a.provider)?.glyph} {getProvider(a.provider)?.name ?? a.provider}</td>
                <td><Link href={`/admin/users/${u.id}`} className="text-sm hover:text-cyan-300">{u.displayName}</Link></td>
                <td>
                  <span className={`text-xs ${a.syncStatus === "ok" ? "text-emerald-300" : a.syncStatus === "error" ? "text-rose-300" : "text-amber-300"}`}>
                    ● {a.syncStatus}
                  </span>
                  {a.syncError && <div className="text-[10px] text-muted max-w-[180px] truncate" title={a.syncError}>{a.syncError}</div>}
                </td>
                <td className="text-xs text-muted">{a.lastSyncedAt ? timeAgo(a.lastSyncedAt) : "never"}</td>
                <td>
                  <div className="flex gap-1.5">
                    <form action={adminResyncAccount.bind(null, a.id)}>
                      <button className="text-xs ghost-btn rounded-full px-2.5 py-1">Sync</button>
                    </form>
                    <form action={adminUnlinkAccount.bind(null, a.id)}>
                      <button className="text-xs rounded-full px-2.5 py-1 border border-rose-400/40 text-rose-300">Unlink</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
