import { asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { saveTrophy, deleteTrophy } from "@/app/actions/admin";
import ImageUpload from "@/components/ImageUpload";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Trophies" };

export default async function AdminTrophiesPage() {
  const db = await getDb();
  // B53: who holds what, always visible. An admin editing a trophy has to be
  // able to see that four hundred people are wearing it BEFORE they change it,
  // not after somebody notices.
  const { trophyHoldings } = await import("@/lib/trophy-admin");
  const [trophies, brands, holdings] = await Promise.all([
    db.select().from(schema.trophies),
    db.select({ id: schema.brands.id, name: schema.brands.name, logoUrl: schema.brands.logoUrl })
      .from(schema.brands).orderBy(asc(schema.brands.name)),
    trophyHoldings(db),
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
          {/* Blank prices it from value and tier; a number here overrides. */}
          <input name="cpPrice" type="number" min={0} step={100} placeholder="CP price (blank = auto)" className="input-cosmic" />
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" name="inMarketplace" defaultChecked /> Sell in the marketplace
          </label>
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
          <Grid trophies={list} brands={brands} brandName={brandName} holdings={holdings} />
        </section>
      ))}

      {branded.length > 0 && <h2 className="font-bold mb-3">General catalogue</h2>}
      <Grid trophies={general} brands={brands} brandName={brandName} holdings={holdings} />
    </div>
  );
}

type Trophy = typeof schema.trophies.$inferSelect;

function Grid({
  trophies, brands, brandName, holdings,
}: {
  trophies: Trophy[];
  brands: { id: string; name: string }[];
  brandName: Map<string, string>;
  holdings: Map<string, { holders: number; redeemed: number; bought: number }>;
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
          {/* Who holds it, how many, and how many cashed out (B53).
              Always on, not behind a disclosure: this is the fact that decides
              whether an edit is safe. */}
          {(() => {
            const h = holdings.get(t.id);
            return (
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 text-[10px]">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${h?.holders ? "bg-cyan-500/15 text-cyan-300" : "bg-white/5 text-muted"}`}>
                  {h?.holders ?? 0} held
                </span>
                {!!h?.redeemed && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-300">
                    {h.redeemed} redeemed
                  </span>
                )}
                {!!h?.bought && (
                  <span className="rounded-full bg-violet-500/15 px-2 py-0.5 font-semibold text-violet-200">
                    {h.bought} bought
                  </span>
                )}
              </div>
            );
          })()}
          <form action={saveTrophy} className="mt-2 space-y-1.5">
            <input type="hidden" name="trophyId" value={t.id} />
            <input name="name" defaultValue={t.name} className="input-cosmic !py-1 !px-2 text-xs w-full" placeholder="Name" title="Name — changes for every holder" />
            <input name="imageUrl" defaultValue={t.imageUrl} className="input-cosmic !py-1 !px-2 text-[10px] w-full" placeholder="Image URL" title="Image — changes for every holder" />
            <input name="title" defaultValue={t.title ?? ""} className="input-cosmic !py-1 !px-2 text-[11px] w-full" placeholder="Title (optional)" />
            <textarea name="description" defaultValue={t.description ?? ""} rows={2}
              className="input-cosmic !py-1 !px-2 text-[11px] w-full" placeholder="Description (optional)" />
            <input type="hidden" name="tier" value={t.tier} />
            <input type="hidden" name="game" value={t.game ?? ""} />
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-emerald-300 font-bold text-sm">$</span>
              <input name="value" type="number" min={0} step="0.01" defaultValue={t.value ?? 0} className="input-cosmic !py-1 !px-2 text-xs w-20" title="Cash value" />
              <input name="cpPrice" type="number" min={0} step={100} defaultValue={t.cpPrice || ""} placeholder="auto"
                className="input-cosmic !py-1 !px-2 text-xs w-24" title="CP price — blank prices it from value and tier" />
              <label className="flex items-center gap-1 text-[11px] text-muted" title="Show on the marketplace shelf">
                <input type="checkbox" name="inMarketplace" defaultChecked={t.inMarketplace} /> Sell
              </label>
            </div>
            <select name="brandId" defaultValue={t.brandId ?? ""} className="input-cosmic !py-1 !px-2 text-[11px] w-full">
              <option value="">No sponsor</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button className="ghost-btn rounded-full px-2.5 py-1 text-[11px]">Save</button>
          </form>
          {/* Delete, or the reason it is refused (B53).
              A held trophy cannot be deleted: `user_trophies.trophyId` cascades,
              so deleting one takes it off every winner's profile with no notice.
              Everything else about it stays editable, which is the point — the
              answer to "this trophy is wrong" is to fix it. */}
          {holdings.get(t.id)?.holders ? (
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              Held by {holdings.get(t.id)!.holders} — cannot be deleted. Edit it instead; every holder sees the change.
            </p>
          ) : (
            <form action={deleteTrophy.bind(null, t.id) as unknown as (fd: FormData) => Promise<void>} className="mt-2">
              <button className="text-xs text-rose-300 hover:underline">Delete</button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
