import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { providerInfoList } from "@/lib/providers/serialize";
import { getProvider } from "@/lib/providers/registry";
import LinkAccountForm from "@/components/LinkAccountForm";
import { unlinkGameAccount, resyncGameAccount } from "@/app/actions/connections";
import SettingsNav from "@/components/SettingsNav";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  ok: "text-emerald-300", pending: "text-amber-300", rate_limited: "text-amber-300",
  error: "text-rose-300", revoked: "text-rose-300", needs_key: "text-amber-300",
};

export default async function ConnectionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const accounts = await db.select().from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.userId, user.id));

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <SettingsNav active="connections" />
      <h1 className="text-2xl font-bold mb-6">Connections</h1>

      {accounts.length > 0 && (
        <div className="space-y-3 mb-10">
          {accounts.map((a) => {
            const p = getProvider(a.provider);
            return (
              <div key={a.id} className="glass flex flex-wrap items-center gap-3 p-4">
                <span className="text-2xl">{p?.glyph ?? "🎮"}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{a.inGameName} <span className="text-muted font-normal text-sm">· {p?.name ?? a.provider}</span></div>
                  <div className="text-xs text-muted">
                    <span className={STATUS_STYLE[a.syncStatus] ?? "text-muted"}>● {a.syncStatus}</span>
                    {a.lastSyncedAt && <> · synced {timeAgo(a.lastSyncedAt)}</>}
                    {a.syncError && <> · {a.syncError}</>}
                  </div>
                </div>
                <form action={resyncGameAccount.bind(null, a.id, "/settings/connections")}>
                  <button className="ghost-btn rounded-full px-4 py-1.5 text-xs">Re-sync</button>
                </form>
                <form action={unlinkGameAccount.bind(null, a.id)}>
                  <button className="rounded-full px-4 py-1.5 text-xs border border-rose-400/40 text-rose-300 hover:bg-rose-500/10">
                    Unlink
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="text-lg font-bold mb-4">Link another account</h2>
      <LinkAccountForm providers={providerInfoList()} />
    </div>
  );
}
