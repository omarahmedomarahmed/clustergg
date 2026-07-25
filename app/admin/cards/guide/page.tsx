import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { CARD_GUIDES, GUIDE_W, GUIDE_H, artBrief, type CardGuide, type Region } from "@/lib/cards/layout-guide";
import { AdminHeader, AdminSection } from "@/components/AdminPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Card layout guide" };

// Where everything lands on a card, so background art can be designed to fit.
//
// Seasonal art is the reason this exists: swapping a Halloween background
// shouldn't mean discovering afterwards that the pumpkin sits behind the
// standings. Each card is drawn to scale with its regions overlaid and a
// ready-to-paste brief underneath.
export default async function CardGuidePage() {
  await requireStaff();
  return (
    <div className="max-w-5xl">
      <AdminHeader
        title="Card layout guide"
        subtitle={`Every Discord card is ${GUIDE_W}×${GUIDE_H}. This is exactly where the renderer puts text, the mascot and the logo — design backgrounds against it, and seasonal art lands right the first time.`}
        back={{ href: "/admin/cards", label: "Card backgrounds" }}
      />

      <AdminSection
        title="The rules that apply to every card"
        hint="These hold whatever the card kind."
      >
        <ul className="text-sm text-muted space-y-2 list-disc pl-5">
          <li>
            <b className="text-ink">The left half is darkened.</b> The renderer lays a scrim over the
            artwork — strongest down the left column and across the bottom — so text stays readable on
            any image. Put atmosphere there, not your subject.
          </li>
          <li>
            <b className="text-ink">The focal point belongs in the upper-right third.</b> It is the only
            large area no card fills with text.
          </li>
          <li>
            <b className="text-ink">Two corners are reserved.</b> Bottom-left is the astronaut, bottom-right
            is the Cluster logo. The logo is drawn last and nothing may cover it.
          </li>
          <li>
            <b className="text-ink">Export at {GUIDE_W}×{GUIDE_H}</b> (or the same 40:21 ratio, larger).
            Art is cover-fitted and downscaled to {GUIDE_W}px, and anything over ~400KB is recompressed.
          </li>
          <li>
            <b className="text-ink">PNG, JPEG, WebP, AVIF and SVG all work.</b> Non-PNG formats are
            converted before rendering.
          </li>
        </ul>
      </AdminSection>

      {CARD_GUIDES.map((g) => (
        <AdminSection key={g.kind} title={g.name} hint={g.summary}>
          <CardMap guide={g} />
          <div className="mt-4 grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Regions</div>
              <div className="space-y-1.5">
                {g.regions.map((r) => (
                  <div key={r.key} className="text-xs flex gap-2">
                    <span className={`shrink-0 mt-0.5 w-2.5 h-2.5 rounded-sm ${swatch(r.kind)}`} />
                    <span>
                      <b className="text-ink">{r.label}</b>
                      <span className="text-muted"> — {r.note}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted mb-2">
                Brief for an artist or an image prompt
              </div>
              <p className="text-xs bg-black/40 border border-white/10 rounded-lg p-3 select-all leading-relaxed">
                {artBrief(g)}
              </p>
              <p className="text-[11px] text-muted mt-2">
                Upload the finished art under{" "}
                <Link href="/admin/cards" className="text-cyan-300 hover:underline">Card backgrounds</Link>
                {" "}→ <code className="text-cyan-300">{g.bgKey}</code>.
              </p>
            </div>
          </div>
        </AdminSection>
      ))}
    </div>
  );
}

// The canvas, to scale, with every region drawn on it.
function CardMap({ guide }: { guide: CardGuide }) {
  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border border-white/15 bg-[#04051a]"
      style={{ aspectRatio: `${GUIDE_W} / ${GUIDE_H}` }}
    >
      {/* The scrim, so the darkened half is visible rather than described. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(90deg, rgba(4,5,26,0.94) 0%, rgba(4,5,26,0.78) 48%, rgba(4,5,26,0.46) 100%)" }}
      />
      {guide.regions.map((r) => (
        <div
          key={r.key}
          className={`absolute rounded ${border(r.kind)} flex items-start`}
          style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
          title={r.note}
        >
          <span className={`text-[9px] sm:text-[10px] px-1 py-0.5 rounded-br font-semibold ${label(r.kind)}`}>
            {r.label}
          </span>
        </div>
      ))}
      <div className="absolute bottom-1 right-2 text-[10px] text-muted">{GUIDE_W} × {GUIDE_H}</div>
    </div>
  );
}

function swatch(kind: Region["kind"]): string {
  return kind === "text" ? "bg-cyan-400/70"
    : kind === "brand" ? "bg-amber-400/70"
      : kind === "art" ? "bg-violet-400/70" : "bg-white/40";
}
function border(kind: Region["kind"]): string {
  return kind === "text" ? "border border-cyan-400/60 bg-cyan-400/10"
    : kind === "brand" ? "border border-amber-400/70 bg-amber-400/10"
      : kind === "art" ? "border border-violet-400/60 bg-violet-400/10"
        : "border border-white/30";
}
function label(kind: Region["kind"]): string {
  return kind === "text" ? "bg-cyan-400/25 text-cyan-100"
    : kind === "brand" ? "bg-amber-400/25 text-amber-100"
      : kind === "art" ? "bg-violet-400/25 text-violet-100" : "bg-white/15";
}
