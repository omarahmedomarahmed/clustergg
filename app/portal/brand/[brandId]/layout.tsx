// The brand portal shell. **The gate is here**, so no page can forget it.
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
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="font-semibold tracking-tight">{brand.name}</span>
            <span className="text-xs text-mute">brand portal</span>
          </div>
          <nav className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.path}
                href={`/portal/brand/${brandId}${n.path}`}
                className="text-mute hover:text-white"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}
