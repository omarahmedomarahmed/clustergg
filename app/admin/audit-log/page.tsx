import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Audit log" };

export default async function AdminAuditLogPage() {
  const db = await getDb();
  const rows = await db.select({ log: schema.auditLog, admin: schema.users })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.auditLog.adminId, schema.users.id))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(100);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit log</h1>
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
