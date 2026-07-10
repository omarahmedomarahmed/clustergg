import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { markAllNotificationsRead } from "@/app/actions/social";
import { timeAgo } from "@/lib/utils";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

const GLYPH: Record<string, string> = {
  follow: "users", badge: "medal", challenge: "zap", mention: "message", system: "satellite", message: "send",
};

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const items = await db.select().from(schema.notifications)
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(50);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {items.some((n) => !n.readAt) && (
          <form action={markAllNotificationsRead}>
            <button className="ghost-btn rounded-full px-4 py-1.5 text-xs">Mark all read</button>
          </form>
        )}
      </div>
      {items.length === 0 ? (
        <div className="glass p-10 text-center text-muted">All quiet on the cosmic front.</div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Link
              key={n.id}
              href={n.href ?? "#"}
              className={`glass glass-hover flex items-start gap-3 p-4 ${n.readAt ? "opacity-60" : "!border-cyan-400/40"}`}
            >
              <Icon name={GLYPH[n.type] ?? "bell"} size={20} className="text-violet-300 mt-0.5" />
              <div className="min-w-0">
                <div className="font-semibold text-sm">{n.title}</div>
                {n.body && <div className="text-xs text-muted mt-0.5">{n.body}</div>}
                <div className="text-[10px] text-muted/70 mt-1">{timeAgo(n.createdAt)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
