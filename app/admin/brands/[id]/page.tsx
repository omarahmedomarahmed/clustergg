import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { saveCampaign } from "@/app/actions/admin";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminBrandDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, id)).limit(1);
  if (!brand) notFound();

  const campaigns = await db.select().from(schema.adCampaigns)
    .where(eq(schema.adCampaigns.brandId, id))
    .orderBy(desc(schema.adCampaigns.createdAt));
  const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="glass p-6">
        <h1 className="text-2xl font-bold">{brand.name}</h1>
        <div className="text-sm text-muted mt-1">{brand.industry} · {brand.status} · {brand.contactEmail}</div>
      </div>

      <div className="glass p-6">
        <h2 className="font-bold mb-4">New campaign</h2>
        <form action={saveCampaign.bind(null, id)} className="grid sm:grid-cols-2 gap-3">
          <input name="name" required placeholder="Campaign name" className="input-cosmic" />
          <input name="budget" type="number" placeholder="Budget (USD)" className="input-cosmic" />
          <input name="startDate" type="date" defaultValue={toLocal(new Date())} className="input-cosmic" />
          <input name="endDate" type="date" defaultValue={toLocal(new Date(Date.now() + 30 * 86400000))} className="input-cosmic" />
          <input name="targetGeo" placeholder="Target geo (e.g. US,GB — blank = all)" className="input-cosmic" />
          <select name="targetDevice" className="input-cosmic">
            <option value="both">All devices</option>
            <option value="desktop">Desktop only</option>
            <option value="mobile">Mobile only</option>
          </select>
          <select name="status" className="input-cosmic">
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
          <div><button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Create campaign</button></div>
        </form>
      </div>

      <div className="glass overflow-x-auto">
        <table className="w-full table-cosmic">
          <thead><tr><th>Campaign</th><th>Window</th><th>Budget</th><th>Targeting</th><th>Status</th></tr></thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td className="font-semibold text-sm">{c.name}</td>
                <td className="text-xs text-muted">{c.startDate.toLocaleDateString()} → {c.endDate.toLocaleDateString()} ({timeAgo(c.endDate).includes("ago") ? "ended" : "running"})</td>
                <td className="text-sm">{c.budget ? `$${c.budget}` : "—"}</td>
                <td className="text-xs text-muted">{c.targetGeo ?? "all geo"} · {c.targetDevice}</td>
                <td><span className={`text-xs ${c.status === "active" ? "text-emerald-300" : "text-amber-300"}`}>● {c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
