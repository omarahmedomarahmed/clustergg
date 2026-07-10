import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { saveBrand } from "@/app/actions/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Brands" };

export default async function AdminBrandsPage() {
  const db = await getDb();
  const brands = await db.select().from(schema.brands).orderBy(desc(schema.brands.createdAt));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Brands</h1>
      <div className="glass p-6 mb-8">
        <h2 className="font-bold mb-4">Add brand</h2>
        <form action={saveBrand} className="grid sm:grid-cols-2 gap-3">
          <input name="name" required placeholder="Brand name" className="input-cosmic" />
          <select name="industry" className="input-cosmic">
            {["hardware", "retail", "tech", "f&b", "other"].map((i) => <option key={i}>{i}</option>)}
          </select>
          <input name="contactEmail" type="email" placeholder="Contact email" className="input-cosmic" />
          <select name="status" className="input-cosmic">
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
          <div><button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Add brand</button></div>
        </form>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {brands.map((b) => (
          <Link key={b.id} href={`/admin/brands/${b.id}`} className="glass glass-hover p-5">
            <div className="flex items-center justify-between">
              <div className="font-bold">{b.name}</div>
              <span className={`text-xs ${b.status === "active" ? "text-emerald-300" : "text-amber-300"}`}>● {b.status}</span>
            </div>
            <div className="text-xs text-muted mt-1">{b.industry} · {b.contactEmail ?? "no contact"}</div>
            <div className="text-xs text-cyan-300 mt-3">Manage campaigns →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
