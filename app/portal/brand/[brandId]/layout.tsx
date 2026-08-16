// The brand portal shell — a **SaaS dashboard, not a page on the website.**
//
// 12 §10: a brand gets **no site nav**. A side nav, and nothing that offers
// them the gamer surfaces I4 says they never see. The nav being on the side
// rather than the top is not decoration: it is what makes the brand portal
// read as its own product rather than as a logged-in view of clustergg.com,
// and it is where the docs and guides live (H2 — *inside* the portal, never a
// link out to the marketing site).
//
// **The gate is here**, so no page can forget it.
//
// §9 — *"See another brand's numbers · which is exactly why nobody sees
// theirs."* That is one sentence with two halves, and the second half is the
// product: a brand tolerates seeing no benchmark because they know the same
// wall stands between their numbers and their competitor's. The wall is
// `requirePortal`, and it is called once, here.

import Link from "next/link";
import { requireBrandPortal, brandForPortal } from "../../../../lib/portal/session.ts";

export const dynamic = "force-dynamic";

const NAV = [
  { path: "", label: "Overview" },
  { path: "/builder", label: "Builder" },
  { path: "/challenges", label: "Challenges" },
  { path: "/trophies", label: "Trophies" },
  { path: "/reports", label: "Reports" },
  { path: "/billing", label: "Billing" },
  { path: "/messages", label: "Messages" },
];

/** H2 — the docs live in here. Each one answers a number on a page above it. */
const GUIDES = [
  { path: "", label: "How a week works" },
  { path: "/reach", label: "Reach and entrants" },
  { path: "/trophies", label: "What a trophy is" },
];

export default async function BrandPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const brand = await brandForPortal(brandId);
  await requireBrandPortal(brandId);

  return (
    <div className="flex min-h-screen" data-nav="brand">
      <aside className="w-56 shrink-0 border-r border-line px-5 py-6">
        <div className="flex flex-col">
          <span className="font-semibold tracking-tight">{brand.name}</span>
          <span className="text-xs text-mute">brand portal</span>
        </div>
        <nav className="mt-6 flex flex-col gap-1 text-sm" aria-label="Brand portal">
          {NAV.map((n) => (
            <Link
              key={n.path}
              href={`/portal/brand/${brandId}${n.path}`}
              className="rounded-md px-2 py-1.5 text-mute hover:bg-line/40 hover:text-white"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        {/* H2 — docs and guides **inside** the portal, not a link to the
            marketing site. A brand who has to leave to find out what "reach"
            means is a brand reading a sales page instead of an answer. */}
        <div className="mt-8 border-t border-line pt-5">
          <p className="text-xs uppercase tracking-wide text-mute">Guides</p>
          <nav className="mt-2 flex flex-col gap-1 text-sm" aria-label="Guides">
            {GUIDES.map((g) => (
              <Link
                key={g.path}
                href={`/portal/brand/${brandId}/guides${g.path}`}
                className="rounded-md px-2 py-1.5 text-mute hover:bg-line/40 hover:text-white"
              >
                {g.label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
