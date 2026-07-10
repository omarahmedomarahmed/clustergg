import { desc, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import Avatar from "@/components/Avatar";
import { setUserRole } from "@/app/actions/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Roles" };

export default async function AdminRolesPage() {
  const me = await getCurrentUser();
  const db = await getDb();
  const privileged = await db.select().from(schema.users)
    .where(inArray(schema.users.role, ["admin", "superadmin", "brand"]))
    .orderBy(desc(schema.users.createdAt));
  const isSuper = me?.role === "superadmin";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Roles & permissions</h1>
      <p className="text-sm text-muted mb-6">
        superadmin — everything incl. role grants · admin — all consoles ·
        brand — reserved for self-serve brand portal.
        {!isSuper && " (Only superadmins can change roles.)"}
      </p>

      <div className="glass overflow-x-auto mb-8">
        <table className="w-full table-cosmic">
          <thead><tr><th>User</th><th>Role</th>{isSuper && <th>Change</th>}</tr></thead>
          <tbody>
            {privileged.map((u) => (
              <tr key={u.id}>
                <td>
                  <span className="flex items-center gap-2">
                    <Avatar name={u.displayName} src={u.avatarUrl} size={28} />
                    <span className="text-sm font-semibold">{u.displayName}</span>
                    <span className="text-xs text-muted">{u.email}</span>
                  </span>
                </td>
                <td className="text-sm capitalize">{u.role}</td>
                {isSuper && (
                  <td>
                    {u.role !== "superadmin" && (
                      <div className="flex gap-1.5">
                        {u.role !== "admin" && (
                          <form action={setUserRole.bind(null, u.id, "admin")}>
                            <button className="text-xs ghost-btn rounded-full px-3 py-1">Make admin</button>
                          </form>
                        )}
                        <form action={setUserRole.bind(null, u.id, "user")}>
                          <button className="text-xs rounded-full px-3 py-1 border border-rose-400/40 text-rose-300">Revoke</button>
                        </form>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isSuper && (
        <p className="text-xs text-muted">
          To promote a regular user: find them in <a href="/admin/users" className="text-cyan-300 underline">Users</a>,
          then grant the role here once they appear. First registered user on a fresh database is superadmin automatically.
        </p>
      )}
    </div>
  );
}
