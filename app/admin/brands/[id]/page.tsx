import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { saveCampaign, saveBrand, adminSendBrandMessage } from "@/app/actions/admin";
import { getBrandInbox } from "@/lib/brands";
import AdminBrandKey from "@/components/AdminBrandKey";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminBrandDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, id)).limit(1);
  if (!brand) notFound();

  const [campaigns, inbox] = await Promise.all([
    db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.brandId, id)).orderBy(desc(schema.adCampaigns.createdAt)),
    getBrandInbox(db, id),
  ]);
  const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="glass p-6">
        <h1 className="text-2xl font-bold">{brand.name}</h1>
        <div className="text-sm text-muted mt-1">{brand.industry} · {brand.status} · {brand.contactEmail}</div>
        <div className="mt-4 max-w-md"><AdminBrandKey brandId={brand.id} slug={brand.slug} initialKey={brand.accessKey} /></div>
      </div>

      {/* Brand portal customization */}
      <div className="glass p-6">
        <h2 className="font-bold mb-4">Portal branding</h2>
        <form action={saveBrand} className="grid sm:grid-cols-2 gap-3">
          <input type="hidden" name="brandId" value={brand.id} />
          <input name="name" required defaultValue={brand.name} placeholder="Brand name" className="input-cosmic" />
          <select name="industry" defaultValue={brand.industry} className="input-cosmic">
            {["hardware", "retail", "tech", "f&b", "other"].map((i) => <option key={i}>{i}</option>)}
          </select>
          <input name="logoUrl" defaultValue={brand.logoUrl ?? ""} placeholder="Logo image URL" className="input-cosmic" />
          <input name="coverUrl" defaultValue={brand.coverUrl ?? ""} placeholder="Portal cover image URL" className="input-cosmic" />
          <input name="contactEmail" type="email" defaultValue={brand.contactEmail ?? ""} placeholder="Contact email" className="input-cosmic" />
          <select name="status" defaultValue={brand.status} className="input-cosmic">
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
          <textarea name="about" defaultValue={brand.about ?? ""} placeholder="About / creative brief shown on the portal" rows={2} className="input-cosmic sm:col-span-2" />
          <div><button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Save branding</button></div>
        </form>
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
            <option value="draft">Draft (upload creatives, then launch)</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
          <div><button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Create campaign</button></div>
        </form>
        <p className="text-xs text-muted mt-2">Tip: create as a draft, then upload one creative per placement (here or from the brand portal) and launch from the <a href="/admin/ads" className="text-cyan-300 underline">master dashboard</a>.</p>
      </div>

      <div className="glass overflow-x-auto">
        <table className="w-full table-cosmic">
          <thead><tr><th>Campaign</th><th>Window</th><th>Budget</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td className="font-semibold text-sm">{c.name}</td>
                <td className="text-xs text-muted">{c.startDate.toLocaleDateString()} → {c.endDate.toLocaleDateString()} ({timeAgo(c.endDate).includes("ago") ? "ended" : "running"})</td>
                <td className="text-sm">{c.budget ? `$${c.budget}` : "—"}</td>
                <td><span className={`text-xs ${c.status === "active" ? "text-emerald-300" : "text-amber-300"}`}>● {c.status}</span></td>
                <td><a href={`/admin/ads/campaign/${c.id}`} className="text-xs text-cyan-300 hover:underline">Manage creatives & analytics →</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Shared inbox with the brand */}
      <div className="glass p-6">
        <h2 className="font-bold mb-3">Shared inbox — {brand.name}</h2>
        <form action={adminSendBrandMessage.bind(null, id)} className="flex gap-2 mb-4">
          <input name="body" placeholder="Reply to the brand…" className="input-cosmic flex-1" />
          <button className="glow-btn rounded-full px-5 py-2 text-sm font-semibold text-white">Send</button>
        </form>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {inbox.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}
          {inbox.map((m) => (
            <div key={m.id} className={`rounded-xl border p-3 text-sm ${m.sender === "admin" ? "border-cyan-400/25 bg-cyan-500/[0.05]" : "border-white/10 bg-white/[0.02]"}`}>
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">{m.sender === "admin" ? "You (Cluster)" : brand.name} · {new Date(m.createdAt).toLocaleString()}</div>
              {m.body}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
