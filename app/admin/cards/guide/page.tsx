import { requireStaff } from "@/lib/auth";
import { CARD_GUIDES, GUIDE_W, GUIDE_H, artBrief } from "@/lib/cards/layout-guide";
import { allLayouts } from "@/lib/cards/layout-store";
import { brandCardArt } from "@/lib/cards/brand";
import { cardBg } from "@/lib/cards/data";
import { previewUrlFor, previewSamples, type CardSample } from "@/lib/cards/preview";
import { assetLibrary } from "@/lib/cards/asset-library";
import CardStudio, { type StudioCard } from "@/components/CardStudio";
import { buttonCopy } from "@/lib/discord/button-store";
import { AdminHeader, AdminSection } from "@/components/AdminPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Card studio" };

// Where everything lands on a card — and where you decide it lands.
//
// This began as a read-only diagram so seasonal background art could be designed
// to fit. The diagram was right and useless: it told you the mascot stands
// bottom-left and left you no way to move it off the thing your artist drew
// there. Then every card became editable, which was better and still wrong — it
// stacked twelve editors and twelve 1200x630 previews down one column, so
// working on one card meant scrolling past eleven you didn't want.
//
// Now it is a studio: pick a card, edit that card. Nothing is per-card-INSTANCE
// — a layout applies to a card KIND, which is what makes it worth setting once.
export default async function CardStudioPage() {
  await requireStaff();
  const [layouts, brand, library, buttons] = await Promise.all([
    allLayouts(), brandCardArt(), assetLibrary(), buttonCopy(),
  ]);
  const backgrounds = await Promise.all(CARD_GUIDES.map((g) => cardBg(g.bgKey)));
  // Several real cards per kind, so a layout can be checked against the range of
  // art it will actually land on rather than against one lucky fixture.
  const samples = await Promise.all(CARD_GUIDES.map((g) => previewSamples(g.kind)));

  const cards: StudioCard[] = CARD_GUIDES.map((g, i) => ({
    kind: g.kind,
    name: g.name,
    summary: g.summary,
    command: g.command,
    group: g.group,
    bgKey: g.bgKey,
    brief: artBrief(g, layouts[g.kind]),
    // Geometry travels with the region now: the editor draws each section
    // where the guide says it lands, so a box on the canvas is the section
    // rather than a rectangle in a list.
    regions: g.regions.map((r) => ({
      key: r.key, label: r.label, note: r.note, kind: r.kind,
      x: r.x, y: r.y, w: r.w, h: r.h,
    })),
    parts: g.parts,
    layout: layouts[g.kind],
    art: {
      bgUrl: backgrounds[i].bgUrl,
      astronautUrl: brand.astronautUrl,
      markUrl: brand.markUrl,
    },
    previewUrl: previewUrlFor(g.kind),
    samples: samples[i] as CardSample[],
  }));

  return (
    <div className="max-w-6xl">
      <AdminHeader
        title="Card studio"
        subtitle={`Every card the bot posts is a ${GUIDE_W}×${GUIDE_H} PNG we render. Pick one and decide what goes where — drag the furniture, place any image on it, and look at the real render underneath.`}
        back={{ href: "/admin/cards", label: "Card backgrounds" }}
      />

      <AdminSection
        title="Four things worth knowing"
        hint="A layout applies to a card kind, everywhere that kind is rendered — Discord, the site's share images, the bot preview on the homepage."
      >
        <ul className="text-sm text-muted space-y-2 list-disc pl-5">
          <li>
            <b className="text-ink">Positions are percentages</b>, so a layout means the same thing at any
            size. Sizes are in canvas pixels of the {GUIDE_W}×{GUIDE_H} card.
          </li>
          <li>
            <b className="text-ink">Saving clears that card&apos;s cached PNGs.</b> Rendered cards are stored
            and reused by content hash, so without this a moved logo would never reach a card somebody
            had already generated. They re-render the next time they&apos;re used.
          </li>
          <li>
            <b className="text-ink">Placed images keep their own opacity.</b> The dark overlay dims the
            background; anything you place on top of it does not go with it. That is how a champion
            splash stays bright over a veiled backdrop.
          </li>
          <li>
            <b className="text-ink">Export art at {GUIDE_W}×{GUIDE_H}</b> (or the same 40:21 ratio, larger).
            PNG, JPEG, WebP, AVIF and SVG all work; anything else is converted before rendering.
          </li>
        </ul>
      </AdminSection>

      <CardStudio cards={cards} library={library} buttonCopy={buttons} />
    </div>
  );
}
