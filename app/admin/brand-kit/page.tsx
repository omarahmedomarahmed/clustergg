import { BRAND_KIT } from "@/lib/assets";
import Icon from "@/components/Icon";
import { getContent } from "@/lib/cms";
import LogoEditor from "@/components/LogoEditor";
import BrandingEditor from "@/components/BrandingEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Brand Kit" };

type Mode = "mark" | "wordmark" | "both";
const asMode = (v: string | undefined): Mode => (v === "mark" || v === "wordmark" ? v : "both");

export default async function BrandKitPage() {
  const c = await getContent([
    "brand.logo", "brand.logo.zoom", "brand.logo.x", "brand.logo.y",
    "brand.wordmark", "brand.nav.mode", "brand.footer.mode",
    "brand.loading.color", "brand.loading.logo",
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Brand & Marketing Kit</h1>
      <p className="text-sm text-muted mb-8">
        Ready-to-use logos, social templates and stream graphics. Click any asset to open
        full-resolution, or use Download. Templates leave space for you to drop in challenge
        details, names and dates in Canva / Photoshop / Figma.
      </p>

      <section className="glass p-6 mb-10">
        <h2 className="font-bold text-lg mb-1 flex items-center gap-2"><Icon name="spark" size={16} className="text-cyan-300" /> Platform logo</h2>
        <p className="text-sm text-muted mb-5">The mark shown in the nav and footer across the whole site. Upload and frame it — changes apply everywhere instantly.</p>
        <LogoEditor
          defaultUrl={c["brand.logo"] || "/assets/logo.png"}
          defaultZoom={Number(c["brand.logo.zoom"]) || 1}
          defaultX={Number(c["brand.logo.x"] ?? 50)}
          defaultY={Number(c["brand.logo.y"] ?? 50)}
        />
      </section>

      <section className="glass p-6 mb-10">
        <h2 className="font-bold text-lg mb-1 flex items-center gap-2"><Icon name="spark" size={16} className="text-cyan-300" /> Wordmark, placement & loading screen</h2>
        <p className="text-sm text-muted mb-5">Upload the wide CLUSTER wordmark, choose what shows in the nav and footer, and style the loading orbit. Applies everywhere instantly.</p>
        <BrandingEditor
          defaultWordmark={c["brand.wordmark"] || ""}
          defaultNavMode={asMode(c["brand.nav.mode"])}
          defaultFooterMode={asMode(c["brand.footer.mode"])}
          defaultLoadingColor={c["brand.loading.color"] || "#8b5cf6"}
          defaultLoadingLogo={c["brand.loading.logo"] || ""}
        />
      </section>

      {BRAND_KIT.map((group) => (
        <section key={group.group} className="mb-10">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400" /> {group.group}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {group.assets.map((a) => (
              <div key={a.url} className="glass overflow-hidden group">
                <a href={a.url} target="_blank" rel="noopener" className="block relative bg-black/40" style={{ aspectRatio: a.aspect }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={a.name} className="w-full h-full object-contain" loading="lazy" />
                </a>
                <div className="p-4">
                  <div className="font-semibold text-sm">{a.name}</div>
                  <div className="text-xs text-muted mt-1 leading-snug">{a.note}</div>
                  <div className="mt-3 flex gap-2">
                    <a href={a.url} download target="_blank" rel="noopener"
                      className="glow-btn pressable rounded-full px-4 py-1.5 text-xs font-semibold text-white inline-flex items-center gap-1.5">
                      <Icon name="arrowDown" size={12} /> Download
                    </a>
                    <a href={a.url} target="_blank" rel="noopener"
                      className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs inline-flex items-center gap-1.5">
                      <Icon name="eye" size={12} /> Open
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="glass p-5 text-sm text-muted">
        <div className="font-bold text-ink mb-1 flex items-center gap-2"><Icon name="spark" size={15} className="text-cyan-300" /> Tips</div>
        <ul className="list-disc pl-5 space-y-1">
          <li>Templates are 1080px (social) and 2K (stream) — high enough for any platform.</li>
          <li>The stream overlay&apos;s center is intentionally empty — layer it on top of your gameplay capture in OBS.</li>
          <li>Want more variations or a specific size? Ask and I&apos;ll generate them into this kit.</li>
        </ul>
      </div>
    </div>
  );
}
