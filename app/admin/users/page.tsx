import Link from "next/link";
import { desc, ilike, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import Avatar from "@/components/Avatar";
import { setUserStatus } from "@/app/actions/admin";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Users" };

export default async function AdminUsersPage({
  searchParams,
}: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const db = await getDb();
  const users = await db.select().from(schema.users)
    .where(q ? or(ilike(schema.users.displayName, `%${q}%`), ilike(schema.users.email, `%${q}%`), ilike(schema.users.slug, `%${q}%`)) : undefined)
    .orderBy(desc(schema.users.createdAt))
    .limit(100);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Users</h1>
      <form className="mb-4 max-w-sm">
        <input name="q" defaultValue={q} placeholder="Search name, email, slug…" className="input-cosmic" />
      </form>
      <div className="glass overflow-x-auto">
        <table className="w-full table-cosmic min-w-[720px]">
          <thead>
            <tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link href={`/admin/users/${u.id}`} className="flex items-center gap-2 hover:text-cyan-300">
                    <Avatar name={u.displayName} src={u.avatarUrl} size={28} />
                    <span className="font-semibold">{u.displayName}</span>
                    <span className="text-xs text-muted">@{u.slug}</span>
                  </Link>
                </td>
                <td className="text-sm text-muted">{u.email}</td>
                <td className="text-sm capitalize">{u.role}</td>
                <td>
                  <span className={`text-xs ${u.status === "active" ? "text-emerald-300" : "text-rose-300"}`}>● {u.status}</span>
                </td>
                <td className="text-xs text-muted">{timeAgo(u.createdAt)}</td>
                <td>
                  <div className="flex gap-1.5">
                    {u.status !== "active" && (
                      <form action={setUserStatus.bind(null, u.id, "active")}>
                        <button className="text-xs ghost-btn rounded-full px-2.5 py-1">Restore</button>
                      </form>
                    )}
                    {u.status === "active" && u.role !== "superadmin" && (
                      <>
                        <form action={setUserStatus.bind(null, u.id, "suspended")}>
                          <button className="text-xs rounded-full px-2.5 py-1 border border-amber-400/40 text-amber-300">Suspend</button>
                        </form>
                        <form action={setUserStatus.bind(null, u.id, "banned")}>
                          <button className="text-xs rounded-full px-2.5 py-1 border border-rose-400/40 text-rose-300">Ban</button>
                        </form>
                      </>
                    )}
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
