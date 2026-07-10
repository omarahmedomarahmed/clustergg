import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { saveCreative, reviewCreative } from "@/app/actions/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Creatives" };

export default async function AdminCreativesPage() {
  const db = await getDb();
  const [creatives, brands] = await Promise.all([
    db.select({ c: schema.adCreatives, b: schema.brands })
      .from(schema.adCreatives)
      .innerJoin(schema.brands, eq(schema.adCreatives.brandId, schema.brands.id))
      .orderBy(desc(schema.adCreatives.createdAt)),
    db.select().from(schema.brands),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Ad creatives</h1>

      <div className="glass p-6 mb-8">
        <h2 className="font-bold mb-1">Upload creative</h2>
        <p className="text-xs text-muted mb-4">
          Paste a hosted file URL (or data: URL). Video creatives are rejected above 5 seconds — plan §11 hard cap.
        </p>
        <form action={saveCreative} className="grid sm:grid-cols-2 gap-3">
          <select name="brandId" required className="input-cosmic">
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input name="name" required placeholder="Creative name (e.g. GPU hero 970x250)" className="input-cosmic" />
          <select name="type" className="input-cosmic">
            <option value="image">Image</option>
            <option value="video">Video (max 5s)</option>
          </select>
          <input name="durationSeconds" type="number" max={5} placeholder="Duration s (video only)" className="input-cosmic" />
          <input name="fileUrl" required placeholder="File URL" className="input-cosmic sm:col-span-2" />
          <input name="clickUrl" placeholder="Click-through URL" className="input-cosmic" />
          <div className="flex gap-2">
            <input name="width" type="number" placeholder="W px" className="input-cosmic" />
            <input name="height" type="number" placeholder="H px" className="input-cosmic" />
          </div>
          <div className="sm:col-span-2">
            <button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Submit for review</button>
          </div>
        </form>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {creatives.map(({ c, b }) => (
          <div key={c.id} className="glass p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-sm truncate">{c.name}</div>
              <span className={`text-xs shrink-0 ${
                c.status === "approved" ? "text-emerald-300" : c.status === "rejected" ? "text-rose-300" : "text-amber-300"}`}>
                ● {c.status}
              </span>
            </div>
            <div className="text-xs text-muted mt-0.5">{b.name} · {c.type} · {c.width}×{c.height}{c.durationSeconds ? ` · ${c.durationSeconds}s` : ""}</div>
            <div className="mt-3 rounded-lg overflow-hidden border border-violet-400/15 bg-black/30" style={{ aspectRatio: `${c.width ?? 4} / ${c.height ?? 1}` , maxHeight: 120 }}>
              {c.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.fileUrl} alt={c.name} className="w-full h-full object-contain" />
              ) : (
                <video src={c.fileUrl} className="w-full h-full object-contain" muted />
              )}
            </div>
            {c.status === "pending_review" && (
              <div className="mt-3 flex gap-2">
                <form action={reviewCreative.bind(null, c.id, true)}>
                  <button className="text-xs glow-btn rounded-full px-4 py-1.5 font-semibold text-white">Approve</button>
                </form>
                <form action={reviewCreative.bind(null, c.id, false)}>
                  <button className="text-xs rounded-full px-4 py-1.5 border border-rose-400/40 text-rose-300">Reject</button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
