import Link from "next/link";
import Icon from "@/components/Icon";
import PortalLogin from "@/components/PortalLogin";
import { MAX_FAILURES } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Brand sign-in — Cluster",
  description: "Open your brand campaign portal with the access key your Cluster contact shared.",
};

// The brand's front door.
//
// It used to only exist as a form buried on the portal page itself, which is
// unreachable unless you already know your own URL — so "where do I log in"
// was a support email rather than a link. This is that link.
export default async function BrandLoginPage({
  searchParams,
}: { searchParams: Promise<{ slug?: string; name?: string }> }) {
  const { slug = "", name = "" } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:py-20">
      <div className="glass p-6 sm:p-8">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold text-violet-200">
          <Icon name="grid" size={12} /> For brands
        </div>
        <h1 className="text-2xl font-bold">Open your campaign portal</h1>
        <p className="mt-1.5 text-sm text-muted">
          Your creatives, your delivery numbers and your Discord card campaign. No Cluster account needed —
          just the access key your contact shared.
        </p>

        <div className="mt-6">
          <PortalLogin kind="brand" initialSlug={slug} initialName={name} />
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-muted">
          {MAX_FAILURES} wrong keys locks this brand&apos;s portal for a while and reports the attempt to our
          team. If that happens to you, email us rather than guessing again.
        </p>

        <div className="mt-6 border-t border-white/8 pt-5 text-sm text-muted">
          Not a customer yet? <Link href="/pricing" className="brand-text hover:underline">See what we sell</Link>
          {" · "}
          <Link href="/brands" className="brand-text hover:underline">Talk to us</Link>
        </div>
        <div className="mt-2 text-sm text-muted">
          Run a Discord server instead? <Link href="/login/server" className="text-sky-300 hover:underline">Server sign-in</Link>
        </div>
      </div>
    </div>
  );
}
