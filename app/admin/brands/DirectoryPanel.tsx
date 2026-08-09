import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { saveBrand } from "@/app/actions/admin";
import { Section, Empty } from "@/components/admin/kit";

// The Brands tab of /admin/brands: the directory itself.
export default async function DirectoryPanel() {
  const db = await getDb();
  const brands = await db.select().from(schema.brands).orderBy(desc(schema.brands.createdAt));

  return (
    <>
      <Section
        title="Add a brand"
        note="Creating one mints its portal slug and access key automatically — a brand can be handed its portal link the moment it exists."
      >
        <form action={saveBrand} className="grid gap-3 sm:grid-cols-2">
          <input name="name" required placeholder="Brand name" className="input-cosmic" />
          <select name="industry" className="input-cosmic">
            {["hardware", "retail", "tech", "f&b", "other"].map((i) => <option key={i}>{i}</option>)}
          </select>
          <input name="contactEmail" type="email" placeholder="Contact email" className="input-cosmic" />
          <select name="status" className="input-cosmic">
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="pending">Pending review</option>
          </select>
          <div>
            <button className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white">Add brand</button>
          </div>
        </form>
      </Section>

      <Section title="Every brand" note="Open one to manage its campaigns, creatives, portal access and the shared inbox.">
        {brands.length === 0 ? (
          <Empty>No brand has been added yet. An enquiry becomes a brand — check the Enquiries tab before adding one by hand.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {brands.map((b) => (
              <Link key={b.id} href={`/admin/brands/${b.id}`} className="glass glass-hover p-5">
                <div className="flex items-center justify-between">
                  <div className="font-bold">{b.name}</div>
                  <span className={`text-xs ${b.status === "active" ? "text-emerald-300" : "text-amber-300"}`}>● {b.status}</span>
                </div>
                <div className="mt-1 text-xs text-muted">{b.industry} · {b.contactEmail ?? "no contact"}</div>
                <div className="mt-3 text-xs text-cyan-300">Manage campaigns →</div>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
