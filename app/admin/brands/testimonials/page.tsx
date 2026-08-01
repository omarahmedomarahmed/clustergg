import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { saveTestimonial, deleteTestimonial } from "@/app/actions/testimonials";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Testimonials" };

// What players said, recorded by a human.
//
// The end-of-month report a brand receives ends with quotes from the people who
// competed, and the only kind worth printing is a real one. There is
// deliberately no path on the platform that generates a testimonial — staff ask
// a winner, staff type what they said, staff attribute it. A month with no
// quotes shows no quotes, which is the correct behaviour and not a gap.
export default async function AdminTestimonialsPage() {
  await requireStaff();
  const db = await getDb();
  const [rows, brands, campaigns] = await Promise.all([
    db.select({
      id: schema.brandTestimonials.id,
      brandId: schema.brandTestimonials.brandId,
      campaignId: schema.brandTestimonials.campaignId,
      name: schema.brandTestimonials.name,
      quote: schema.brandTestimonials.quote,
      status: schema.brandTestimonials.status,
      createdAt: schema.brandTestimonials.createdAt,
      userName: schema.users.displayName,
      slug: schema.users.slug,
    }).from(schema.brandTestimonials)
      .leftJoin(schema.users, eq(schema.brandTestimonials.userId, schema.users.id))
      .orderBy(desc(schema.brandTestimonials.createdAt)).limit(200),
    db.select({ id: schema.brands.id, name: schema.brands.name })
      .from(schema.brands).orderBy(asc(schema.brands.name)),
    db.select({ id: schema.sponsoredCampaigns.id, brandId: schema.sponsoredCampaigns.brandId, game: schema.sponsoredCampaigns.game, startAt: schema.sponsoredCampaigns.startAt })
      .from(schema.sponsoredCampaigns).orderBy(desc(schema.sponsoredCampaigns.createdAt)).limit(100),
  ]);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));

  return (
    <div className="max-w-4xl">
      <div className="mb-2 flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Testimonials</h1>
        <Link href="/admin/brands" className="text-sm text-cyan-300 hover:underline">← Brands</Link>
      </div>
      <p className="mb-8 max-w-2xl text-sm text-muted">
        Quotes from players who competed in a brand&apos;s challenges. These are the closing section of the
        end-of-month report the brand receives, so they carry more weight than any number on it — type what
        the person actually said, and attribute it to them. Attach one to a campaign to keep it with that
        month; leave the campaign blank and it shows on all of that brand&apos;s reports.
      </p>

      <div className="glass mb-8 p-6">
        <h2 className="mb-4 font-bold">Record a quote</h2>
        <form action={saveTestimonial} className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">
            <span className="mb-1 block">Brand</span>
            <select name="brandId" required className="input-cosmic w-full">
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">
            <span className="mb-1 block">Campaign (optional)</span>
            <select name="campaignId" className="input-cosmic w-full">
              <option value="">All of this brand&apos;s reports</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {brandName.get(c.brandId) ?? "?"} · {c.game} · {c.startAt.toISOString().slice(0, 10)}
                </option>
              ))}
            </select>
          </label>
          <input name="name" placeholder="Who said it (their name as printed)" className="input-cosmic" />
          <input name="userId" placeholder="Cluster user id (optional — links their profile)" className="input-cosmic" />
          <textarea name="quote" required rows={3} placeholder="What they said, in their words." className="input-cosmic sm:col-span-2" />
          <div className="sm:col-span-2">
            <button className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white">Add quote</button>
          </div>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="glass p-6 text-sm text-muted">
          Nothing recorded yet. After a challenge ends, message the winners and ask what they thought — that
          conversation is the report&apos;s last page.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((t) => (
            <div key={t.id} className="glass p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-muted">
                    {brandName.get(t.brandId) ?? "Unknown brand"}
                    {t.campaignId ? " · one campaign" : " · all reports"}
                    {" · "}{t.createdAt.toISOString().slice(0, 10)}
                  </div>
                  <blockquote className="mt-1 text-sm leading-relaxed">“{t.quote}”</blockquote>
                  <div className="mt-1 text-xs text-muted">
                    — {t.name || t.userName || "a player"}
                    {t.slug && <> · <Link href={`/u/${t.slug}`} className="text-cyan-300 hover:underline">profile</Link></>}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                  t.status === "published" ? "border-emerald-400/45 bg-emerald-500/12 text-emerald-200" : "border-white/20 text-muted"
                }`}>{t.status}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <form action={saveTestimonial}>
                  <input type="hidden" name="testimonialId" value={t.id} />
                  <input type="hidden" name="brandId" value={t.brandId} />
                  <input type="hidden" name="quote" value={t.quote} />
                  <input type="hidden" name="name" value={t.name} />
                  <input type="hidden" name="status" value={t.status === "published" ? "draft" : "published"} />
                  <button className="ghost-btn rounded-full px-3 py-1 text-xs">
                    {t.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                </form>
                <form action={deleteTestimonial.bind(null, t.id)}>
                  <button className="text-xs text-rose-300 hover:underline">Delete</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
