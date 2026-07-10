import { asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { savePartner, deletePartner } from "@/app/actions/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Partners" };

export default async function AdminPartnersPage() {
  const db = await getDb();
  const partners = await db.select().from(schema.partners).orderBy(asc(schema.partners.sortOrder));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Partners — &quot;Trusted by&quot;</h1>
      <p className="text-sm text-muted mb-6">
        Logos in the homepage slider. Brand/ad deals are handled offline — this is the only
        public-facing brand surface.
      </p>

      <div className="glass p-6 mb-8">
        <h2 className="font-bold mb-4">Add partner</h2>
        <form action={savePartner} className="grid sm:grid-cols-2 gap-3">
          <input name="name" required placeholder="Partner name" className="input-cosmic" />
          <input name="logoUrl" required placeholder="Logo image URL (transparent PNG/SVG ideal)" className="input-cosmic" />
          <input name="url" placeholder="Website link (optional)" className="input-cosmic" />
          <input name="sortOrder" type="number" defaultValue={0} placeholder="Sort order" className="input-cosmic" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked className="accent-violet-500" /> Visible
          </label>
          <div><button className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white">Add partner</button></div>
        </form>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {partners.map((p) => (
          <div key={p.id} className="glass p-4 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.logoUrl} alt={p.name} className="h-10 w-24 object-contain rounded bg-black/30 border border-violet-400/15" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm">{p.name} {!p.isActive && <span className="text-xs text-rose-300">(hidden)</span>}</div>
              <div className="text-xs text-muted truncate">{p.url ?? "no link"}</div>
            </div>
            <form action={deletePartner.bind(null, p.id)}>
              <button className="text-xs text-rose-300 hover:underline">Remove</button>
            </form>
          </div>
        ))}
        {partners.length === 0 && <p className="text-sm text-muted">No partners yet.</p>}
      </div>
    </div>
  );
}
