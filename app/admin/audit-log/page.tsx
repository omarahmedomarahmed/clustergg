import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { timeAgo } from "@/lib/utils";
import { recentAttempts } from "@/lib/portal-attempts";
import { MAX_FAILURES } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Audit log" };

export default async function AdminAuditLogPage() {
  const db = await getDb();
  const [rows, attempts] = await Promise.all([
    db.select({ log: schema.auditLog, admin: schema.users })
      .from(schema.auditLog)
      .leftJoin(schema.users, eq(schema.auditLog.adminId, schema.users.id))
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(100),
    recentAttempts(60),
  ]);
  const failed = attempts.filter((a) => !a.ok).length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit log</h1>

      {/* Portal sign-ins.
          Brands and server owners don't have Cluster accounts, so nothing they
          do appears in the admin log above — including somebody working through
          keys against a customer's portal. This is where that shows up, and it
          is the only place a "did anyone try to get into our account?" question
          can be answered. */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Portal sign-in attempts</h2>
          <p className="text-xs text-muted">
            {failed > 0
              ? `${failed} failed of the last ${attempts.length}. ${MAX_FAILURES} in a row locks that portal.`
              : `Last ${attempts.length}. ${MAX_FAILURES} failures in a row locks a portal.`}
          </p>
        </div>
        <div className="glass overflow-x-auto">
          <table className="w-full table-cosmic min-w-[560px]">
            <thead><tr><th>When</th><th>Portal</th><th>Result</th><th>From</th></tr></thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td className="text-xs text-muted">{timeAgo(a.createdAt)}</td>
                  <td className="text-sm">
                    {a.portalName ?? a.portalId}
                    <span className="ml-1.5 text-[10px] uppercase tracking-widest text-muted">{a.kind}</span>
                  </td>
                  <td className={`text-xs font-semibold ${a.ok ? "text-emerald-300" : "text-rose-300"}`}>
                    {a.ok ? "signed in" : "wrong key"}
                  </td>
                  {/* The IP is hashed at write time, so this identifies a
                      repeat visitor without storing where they live. */}
                  <td className="font-mono text-[11px] text-muted">{a.hashedIp?.slice(0, 12) ?? "—"}</td>
                </tr>
              ))}
              {attempts.length === 0 && (
                <tr><td colSpan={4} className="text-center text-muted text-sm py-6">No portal sign-ins recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <h2 className="text-lg font-bold mb-3">Staff actions</h2>
      <div className="glass overflow-x-auto">
        <table className="w-full table-cosmic min-w-[560px]">
          <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th></tr></thead>
          <tbody>
            {rows.map(({ log, admin }) => (
              <tr key={log.id}>
                <td className="text-xs text-muted">{timeAgo(log.createdAt)}</td>
                <td className="text-sm">{admin?.displayName ?? log.adminId}</td>
                <td className="font-mono text-xs text-cyan-300">{log.action}</td>
                <td className="text-xs text-muted">{log.targetType} {log.targetId?.slice(0, 20)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="text-center text-muted text-sm py-6">No admin actions recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
