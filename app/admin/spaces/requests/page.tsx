import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { reviewSpaceRequest } from "@/app/actions/admin";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Space requests" };

export default async function AdminSpaceRequestsPage() {
  const db = await getDb();
  const rows = await db.select({ r: schema.spaceRequests, u: schema.users })
    .from(schema.spaceRequests)
    .innerJoin(schema.users, eq(schema.spaceRequests.requestedBy, schema.users.id))
    .orderBy(desc(schema.spaceRequests.createdAt))
    .limit(50);

  async function approve(id: string, formData: FormData) {
    "use server";
    await reviewSpaceRequest(id, true, String(formData.get("note") ?? ""));
  }
  async function reject(id: string, formData: FormData) {
    "use server";
    await reviewSpaceRequest(id, false, String(formData.get("note") ?? ""));
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Space requests</h1>
      <div className="space-y-3">
        {rows.length === 0 && <div className="glass p-8 text-center text-muted">No requests.</div>}
        {rows.map(({ r, u }) => (
          <div key={r.id} className="glass p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{r.proposedName}</span>
              <span className="text-xs text-muted">by {u.displayName} · {timeAgo(r.createdAt)}</span>
              <span className={`ml-auto text-xs rounded-full px-2.5 py-0.5 border ${
                r.status === "pending" ? "border-amber-400/40 text-amber-300"
                : r.status === "approved" ? "border-emerald-400/40 text-emerald-300"
                : "border-rose-400/40 text-rose-300"}`}>
                {r.status}
              </span>
            </div>
            <p className="text-sm text-muted mt-2">{r.reason}</p>
            {r.status === "pending" && (
              <div className="mt-4 flex flex-wrap gap-2 items-center">
                <form action={approve.bind(null, r.id)} className="flex gap-2 items-center">
                  <input name="note" placeholder="Note (optional)" className="input-cosmic !w-52 !py-1.5 text-sm" />
                  <button className="glow-btn rounded-full px-5 py-1.5 text-xs font-semibold text-white">Approve & create</button>
                </form>
                <form action={reject.bind(null, r.id)} className="flex gap-2 items-center">
                  <input name="note" placeholder="Rejection reason" className="input-cosmic !w-52 !py-1.5 text-sm" />
                  <button className="rounded-full px-5 py-1.5 text-xs border border-rose-400/40 text-rose-300">Reject</button>
                </form>
              </div>
            )}
            {r.reviewNote && <p className="text-xs text-muted mt-2">Review note: {r.reviewNote}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
