import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { CARD_GUIDES, GUIDE_W, GUIDE_H, artBrief } from "@/lib/cards/layout-guide";
import { allLayouts } from "@/lib/cards/layout-store";
import { brandCardArt } from "@/lib/cards/brand";
import { cardBg } from "@/lib/cards/data";
import { previewUrlFor } from "@/lib/cards/preview";
import CardLayoutEditor from "@/components/CardLayoutEditor";
import { AdminHeader, AdminSection } from "@/components/AdminPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Card layouts" };

// Where everything lands on a card — and now, where you decide it lands.
//
// This began as a read-only diagram so seasonal background art could be
// designed to fit. The diagram was right and useless: it told you the mascot
// stands bottom-left and left you no way to move it off the thing your artist
// drew there. So every card is editable here. Drag the mascot, the logo and the
// top-right badge, resize the content block, set how dark the art goes and
// whether text sits on a plate — then look at the real rendered PNG underneath.
//
// Nothing is per-card-instance: a layout applies to a card KIND, which is what
// makes it worth setting once.
export default async function CardLayoutPage() {
  await requireStaff();
  const [layouts, brand] = await Promise.all([allLayouts(), brandCardArt()]);
  const backgrounds = await Promise.all(CARD_GUIDES.map((g) => cardBg(g.bgKey)));

  return (
    <div className="max-w-5xl">
      <AdminHeader
        title="Card layouts"
        subtitle={`Every card the bot posts is a ${GUIDE_W}×${GUIDE_H} PNG we render. This is where you decide what goes where on each one — and design background art against it.`}
        back={{ href: "/admin/cards", label: "Card backgrounds" }}
      />

      <AdminSection
        title="How these work"
        hint="A layout applies to a card kind, everywhere that kind is rendered — Discord, the site's share images, the bot preview on the homepage."
      >
        <ul className="text-sm text-muted space-y-2 list-disc pl-5">
          <li>
            <b className="text-ink">Positions are percentages</b>, so a layout means the same thing at any
            size. Sizes are in canvas pixels of the {GUIDE_W}×{GUIDE_H} card.
          </li>
          <li>
            <b className="text-ink">Saving clears that card&apos;s cached PNGs.</b> Rendered cards are stored
            and reused by content hash, so without this a moved logo would never reach a card
            somebody had already generated. They re-render the next time they&apos;re used.
          </li>
          <li>
            <b className="text-ink">The dark overlay is the first control to reach for.</b> Bright artwork
            eats text. Raise the overlay, or turn on the plate to darken only what sits under the
            headline and leave the rest of the art alone.
          </li>
          <li>
            <b className="text-ink">Export art at {GUIDE_W}×{GUIDE_H}</b> (or the same 40:21 ratio, larger).
            PNG, JPEG, WebP, AVIF and SVG all work; anything else is converted before rendering.
          </li>
        </ul>
      </AdminSection>

      {CARD_GUIDES.map((g, i) => (
        <AdminSection key={g.kind} title={g.name} hint={g.summary}>
          <CardLayoutEditor
            kind={g.kind}
            name={g.name}
            initial={layouts[g.kind]}
            art={{
              bgUrl: backgrounds[i].bgUrl,
              astronautUrl: brand.astronautUrl,
              markUrl: brand.markUrl,
            }}
            previewUrl={previewUrlFor(g.kind)}
          />
          <div className="mt-5 grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted mb-2">What this card draws</div>
              <div className="space-y-1.5">
                {g.regions.filter((r) => r.kind === "text").map((r) => (
                  <div key={r.key} className="text-xs flex gap-2">
                    <span className="shrink-0 mt-0.5 w-2.5 h-2.5 rounded-sm bg-cyan-400/70" />
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
                {artBrief(g, layouts[g.kind])}
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
