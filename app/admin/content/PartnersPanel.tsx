import { asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { savePartner, deletePartner } from "@/app/actions/admin";
import ImageUpload from "@/components/ImageUpload";
import { Section, Empty } from "@/components/admin/kit";

// The Partners tab. Was /admin/partners, a 55-line route.
export default async function PartnersPanel() {
  const db = await getDb();
  const partners = await db.select().from(schema.partners).orderBy(asc(schema.partners.sortOrder));

  return (
    <>
      <Section title="Add a partner" note="Logos in the homepage trusted-by slider. A transparent PNG or SVG sits best on the dark strip.">
        <form action={savePartner} className="grid gap-3 sm:grid-cols-2">
          <input name="name" required placeholder="Partner name" className="input-cosmic" />
          <input name="url" placeholder="Website link (optional)" className="input-cosmic" />
          <div className="sm:col-span-2">
            <ImageUpload name="logoUrl" label="Partner logo" aspect="16/9" maxDim={600} scope="partner" hint="Transparent PNG/SVG works best." />
          </div>
          <input name="sortOrder" type="number" defaultValue={0} placeholder="Sort order" className="input-cosmic" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked className="accent-violet-500" /> Visible
          </label>
          <div>
            <button className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white">Add partner</button>
          </div>
        </form>
      </Section>

      <Section
        title="On the strip"
        note="Removing a logo takes it off the homepage immediately. It does not end any commercial arrangement — those live with the brand, not here."
      >
        {partners.length === 0 ? (
          <Empty>No partner logos yet, so the trusted-by strip is hidden rather than shown empty.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {partners.map((p) => (
              <div key={p.id} className="glass flex items-center gap-4 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.logoUrl} alt={p.name} className="h-10 w-24 rounded border border-violet-400/15 bg-black/30 object-contain" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">
                    {p.name} {!p.isActive && <span className="text-xs text-rose-300">(hidden)</span>}
                  </div>
                  <div className="truncate text-xs text-muted">{p.url ?? "no link"}</div>
                </div>
                <form action={deletePartner.bind(null, p.id)}>
                  <button className="text-xs text-rose-300 hover:underline">Remove</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
