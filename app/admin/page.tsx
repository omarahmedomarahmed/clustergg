import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Dashboard" };

export default async function AdminDashboard() {
  const db = await getDb();
  const [[users], [accounts], [posts], [impressions], [clicks], [pendingReqs], syncErrors] = await Promise.all([
    db.select({ c: count() }).from(schema.users),
    db.select({ c: count() }).from(schema.linkedGameAccounts),
    db.select({ c: count() }).from(schema.posts),
    db.select({ c: count() }).from(schema.adImpressions),
    db.select({ c: count() }).from(schema.adClicks),
    db.select({ c: count() }).from(schema.spaceRequests).where(eq(schema.spaceRequests.status, "pending")),
    db.select({ c: count() }).from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.syncStatus, "error")),
  ]);

  const tiles = [
    { label: "Users", value: users?.c ?? 0 },
    { label: "Linked accounts", value: accounts?.c ?? 0 },
    { label: "Posts", value: posts?.c ?? 0 },
    { label: "Ad impressions", value: impressions?.c ?? 0 },
    { label: "Ad clicks", value: clicks?.c ?? 0 },
    { label: "Pending space requests", value: pendingReqs?.c ?? 0 },
    { label: "Accounts in sync error", value: syncErrors[0]?.c ?? 0 },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="glass p-5">
            <div className="text-3xl font-bold grad-text">{Number(t.value).toLocaleString()}</div>
            <div className="text-xs uppercase tracking-widest text-muted mt-1">{t.label}</div>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted mt-8">
        Full management consoles (users, spaces, challenges, brands, ads) are in the sidebar.
      </p>
    </div>
  );
}
