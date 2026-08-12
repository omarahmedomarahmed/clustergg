import Link from "next/link";
import { count, countDistinct, desc, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { adminResyncAccount, adminUnlinkAccount } from "@/app/actions/admin";
import { getProvider, PROVIDERS, isProviderLive } from "@/lib/providers/registry";
import { timeAgo } from "@/lib/utils";
import { requireSystemFor } from "@/lib/departments";
import { isProof, proofFor } from "@/lib/account-ownership";
import { riotKeyHealth } from "@/lib/providers/riot-verify";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Linked accounts" };

export default async function AdminLinkedAccountsPage() {
  // Admins only. Every linked account on the platform, joined to the person who
  // owns it, is the most sensitive list in the product — and no department's
  // job needs to browse it. The rail hides the link; this refuses the page.
  await requireSystemFor("/admin/linked-accounts");

  const db = await getDb();
  const rows = await db.select({ a: schema.linkedGameAccounts, u: schema.users })
    .from(schema.linkedGameAccounts)
    .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
    .orderBy(desc(schema.linkedGameAccounts.createdAt))
    .limit(200);

  const errorCount = rows.filter((r) => r.a.syncStatus === "error").length;
  const provenCount = rows.filter((r) => r.a.verified && isProof(r.a.verifiedMethod)).length;
  const disputed = rows.filter((r) => r.a.ownershipStatus === "disputed");

  // Every account two gamers hold at once, from the whole table rather than the
  // page of 200 — a collision buried on page 4 is still a collision, and this is
  // the list somebody has to work through.
  const collisions = await db.select({
    provider: schema.linkedGameAccounts.provider,
    accountId: schema.linkedGameAccounts.providerAccountId,
    holders: count(),
  })
    .from(schema.linkedGameAccounts)
    .groupBy(schema.linkedGameAccounts.provider, schema.linkedGameAccounts.providerAccountId)
    .having(gt(countDistinct(schema.linkedGameAccounts.userId), 1))
    .limit(50);

  // Riot's development key expires every 24 hours, and when it does every
  // League link and sync fails with a 403 that nothing else surfaces.
  const riot = await riotKeyHealth().catch(() => null);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Linked accounts</h1>
      <p className="text-sm text-muted mb-6">
        {rows.length} accounts · {provenCount} with proven ownership · {errorCount} in error ·{" "}
        {PROVIDERS.filter(isProviderLive).length}/{PROVIDERS.length} providers live
      </p>

      {/* Two gamers, one account. Nothing is deleted automatically — a linked
          account carries a season of standings and prize history — so these are
          surfaced for a person to resolve. */}
      {(collisions.length > 0 || disputed.length > 0) && (
        <div className="glass mb-6 border border-amber-400/30 p-4">
          <h2 className="mb-2 text-sm font-bold text-amber-200">Ownership conflicts</h2>
          {collisions.length > 0 ? (
            <>
              <p className="mb-3 text-xs text-muted">
                {collisions.length} game account{collisions.length === 1 ? " is" : "s are"} held by more than one gamer.
                These predate one-account-one-gamer; new links can no longer collide.
              </p>
              <ul className="space-y-1 text-xs">
                {collisions.map((c) => (
                  <li key={`${c.provider}:${c.accountId}`} className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{getProvider(c.provider)?.name ?? c.provider}</span>
                    <code className="text-muted">{c.accountId}</code>
                    <span className="text-amber-300">{Number(c.holders)} holders</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-muted">No live collisions. {disputed.length} account{disputed.length === 1 ? "" : "s"} previously resolved in someone else\'s favour.</p>
          )}
        </div>
      )}

      {/* Riot key health. If the key stops answering it takes every League link
          and sync with it, silently, so it gets a panel of its own.

          Only the first three pills are health: red means something that should
          work does not. "Production access" is a capability we do not have and
          have not asked for — it is off on a perfectly healthy day, so it is
          drawn neutral. It was previously labelled "VALORANT stats" and drawn
          red, which made every normal day look like an outage. */}
      {riot && (
        <div className="glass mb-6 p-4">
          <h2 className="mb-2 text-sm font-bold">Riot API key</h2>
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            {([["Configured", riot.configured], ["Riot accounts", riot.account], ["League", riot.summoner]] as [string, boolean][]).map(([label, up]) => (
              <span key={label} className={`rounded-full border px-2.5 py-1 ${up ? "border-emerald-400/40 text-emerald-300" : "border-rose-400/40 text-rose-300"}`}>
                {up ? "●" : "○"} {label}
              </span>
            ))}
            <span className={`rounded-full border px-2.5 py-1 ${riot.production ? "border-emerald-400/40 text-emerald-300" : "border-white/15 text-muted"}`}>
              {riot.production ? "● Production access" : "○ Personal key (39 methods)"}
            </span>
          </div>
          <p className="text-xs text-muted">{riot.note}</p>
        </div>
      )}

      <div className="glass p-4 mb-6">
        <h2 className="text-sm font-bold mb-3">Provider status</h2>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((p) => (
            <span
              key={p.id}
              title={p.envVars.join(", ") || "public API"}
              className={`text-xs rounded-full px-2.5 py-1 border ${isProviderLive(p) ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/30 text-amber-300/80"}`}
            >
              {p.name}
            </span>
          ))}
        </div>
      </div>

      <div className="glass overflow-x-auto">
        <table className="w-full table-cosmic min-w-[760px]">
          <thead>
            <tr><th>Account</th><th>Provider</th><th>Owner</th><th>Ownership</th><th>Status</th><th>Last sync</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {rows.map(({ a, u }) => (
              <tr key={a.id}>
                <td className="font-semibold text-sm">{a.inGameName}</td>
                <td className="text-sm">{getProvider(a.provider)?.name ?? a.provider}</td>
                <td><Link href={`/admin/users/${u.id}`} className="text-sm hover:text-cyan-300">{u.displayName}</Link></td>
                <td className="text-xs">
                  {a.ownershipStatus === "disputed"
                    ? <span className="text-amber-300">disputed</span>
                    : a.verified && isProof(a.verifiedMethod)
                      ? <span className="text-emerald-300">proven · {a.verifiedMethod}</span>
                      : <span className="text-muted" title={proofFor(a.provider).how}>
                          claimed{proofFor(a.provider).kind === "none" ? " · no check exists" : ""}
                        </span>}
                </td>
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
