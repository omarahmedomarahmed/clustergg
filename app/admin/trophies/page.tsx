import { asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { saveTrophy, deleteTrophy } from "@/app/actions/admin";
import ImageUpload from "@/components/ImageUpload";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Trophies" };

export default async function AdminTrophiesPage() {
  const db = await getDb();
  const [trophies, brands] = await Promise.all([
    db.select().from(schema.trophies),
    db.select({ id: schema.brands.id, name: schema.brands.name, logoUrl: schema.brands.logoUrl })
      .from(schema.brands).orderBy(asc(schema.brands.name)),
  ]);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));

  // Branded trophies are grouped by sponsor, because the question staff ask is
  // never "what trophies exist" — it's "does this brand have its three yet".
  const branded = trophies.filter((t) => t.brandId);
  const general = trophies.filter((t) => !t.brandId);
  const byBrand = new Map<string, typeof trophies>();
  for (const t of branded) {
    const list = byBrand.get(t.brandId!) ?? [];
    list.push(t);
    byBrand.set(t.brandId!, list);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Trophy library</h1>
      <p className="text-sm text-muted mb-6 max-w-3xl">
        Prize art attached to challenges. Winners display their trophy on their profile and can redeem it
        for the dollar value set here. A trophy assigned to a <b className="text-ink">brand</b> carries that
        sponsor&apos;s logo — it is offered only in that brand&apos;s own challenges, so nobody ends up with the
        wrong logo on their profile forever. Three per brand is the set: first, second, third.
      </p>

      <div className="glass p-6 mb-8">
        <h2 className="font-bold mb-4">Add trophy</h2>
        <form action={saveTrophy} className="grid sm:grid-cols-2 gap-3">
          <input name="name" required placeholder="Trophy name" className="input-cosmic" />
          <select name="tier" className="input-cosmic">
            {["gold", "silver", "bronze", "legendary"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <input name="game" placeholder="Game (optional — blank = universal)" className="input-cosmic" />
          <input name="value" type="number" min={0} step="0.01" placeholder="Value in USD (e.g. 25)" className="input-cosmic" />
          <label className="sm:col-span-2 text-xs text-muted">
            <span className="mb-1 block">Sponsor</span>
            <select name="brandId" className="input-cosmic w-full">
              <option value="">General catalogue — any challenge</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2">
            <ImageUpload name="imageUrl" label="Trophy image" aspect="1/1" maxDim={700} scope="trophy" hint="Transparent PNG of the trophy/cup. For a branded set, put the sponsor's logo on it." />
          </div>
          <div><button className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white">Add trophy</button></div>
        </form>
      </div>

      {[...byBrand.entries()].map(([brandId, list]) => (
        <section key={brandId} className="mb-8">
          <div className="mb-3 flex items-baseline gap-2">
            <h2 className="font-bold">{brandName.get(brandId) ?? "Unknown brand"}</h2>
            <span className={`text-xs ${list.length >= 3 ? "text-emerald-300" : "text-amber-300"}`}>
              {list.length} of 3 · ${list.reduce((a, t) => a + (t.value ?? 0), 0).toLocaleString()} total
              {list.length < 3 && " — the set isn't complete"}
            </span>
          </div>
          <Grid trophies={list} brands={brands} brandName={brandName} />
        </section>
      ))}

      {branded.length > 0 && <h2 className="font-bold mb-3">General catalogue</h2>}
      <Grid trophies={general} brands={brands} brandName={brandName} />
    </div>
  );
}

type Trophy = typeof schema.trophies.$inferSelect;

function Grid({
  trophies, brands, brandName,
}: {
  trophies: Trophy[];
  brands: { id: string; name: string }[];
  brandName: Map<string, string>;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {trophies.map((t) => (
        <div key={t.id} className="glass p-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.imageUrl} alt={t.name} className="mx-auto h-32 object-contain" />
          <div className="font-semibold text-sm mt-2">{t.name}</div>
          <div className="text-xs text-muted capitalize">{t.tier}{t.game ? ` · ${t.game}` : " · universal"}</div>
          {t.brandId && (
            <div className="mt-1 inline-block rounded-full border border-violet-400/45 bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-violet-200">
              {brandName.get(t.brandId) ?? "brand"}
            </div>
          )}
          {/* One form for both edits a trophy actually needs after it exists:
              what it's worth, and whose logo it carries. */}
          <form action={saveTrophy} className="mt-2 space-y-1.5">
            <input type="hidden" name="trophyId" value={t.id} />
            <input type="hidden" name="name" value={t.name} />
            <input type="hidden" name="imageUrl" value={t.imageUrl} />
            <input type="hidden" name="tier" value={t.tier} />
            <input type="hidden" name="game" value={t.game ?? ""} />
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-emerald-300 font-bold text-sm">$</span>
              <input name="value" type="number" min={0} step="0.01" defaultValue={t.value ?? 0} className="input-cosmic !py-1 !px-2 text-xs w-20" />
            </div>
            <select name="brandId" defaultValue={t.brandId ?? ""} className="input-cosmic !py-1 !px-2 text-[11px] w-full">
              <option value="">No sponsor</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button className="ghost-btn rounded-full px-2.5 py-1 text-[11px]">Save</button>
          </form>
          <form action={deleteTrophy.bind(null, t.id)} className="mt-2">
            <button className="text-xs text-rose-300 hover:underline">Delete</button>
          </form>
        </div>
      ))}
    </div>
  );
}
