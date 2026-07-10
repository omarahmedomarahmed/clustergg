import Link from "next/link";
import Avatar from "@/components/Avatar";
import type { schema } from "@/lib/db";

export default function UserList({ title, users }: { title: string; users: (typeof schema.users.$inferSelect)[] }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">{title}</h1>
      {users.length === 0 ? (
        <div className="glass p-8 text-center text-muted">Empty space out here.</div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <Link key={u.id} href={`/u/${u.slug}`} className="glass card-lift flex items-center gap-3 p-3">
              <Avatar name={u.displayName} src={u.avatarUrl} size={44} />
              <div className="min-w-0">
                <div className="font-semibold">{u.displayName}</div>
                <div className="text-xs text-muted truncate">{u.bio ?? `@${u.slug}`}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
