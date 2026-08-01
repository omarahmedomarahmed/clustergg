import Link from "next/link";
import Icon from "@/components/Icon";
import EnquiryForm from "@/components/EnquiryForm";
import { pricingLive } from "@/lib/pricing-live";
import { money, quote } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Talk to us — buy media inside Discord",
  description:
    "Tell us the audience you want to reach and we'll tell you honestly whether we have it. Sponsored challenges and placements across Discord gaming communities, on a published rate card.",
};

// Where every pricing CTA lands.
//
// It carries the plan through the URL (?games=3&addon=1&billing=yearly) so the
// form opens on the configuration they were just looking at — the single
// biggest drop-off in a SaaS funnel is making someone re-specify what they
// already chose one screen ago.
export default async function BrandsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";

  const { cfg, copy, network, games, placements } = await pricingLive();
  const initialGames = Math.max(0, Math.min(cfg.games, Number(one("games")) || 0));
  const initialAddon = one("addon") === "1" || one("addon") === "true";
  const initialYearly = one("billing") === "yearly";
  const nf = (n: number) => n.toLocaleString();
  const full = quote(cfg, { games: cfg.games });

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-10 items-start">
        <div>
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs text-cyan-200/90 mb-6">
            <span className="inline-block h-2 w-2 rounded-full bg-cyan-300 animate-pulse" /> For brands
          </div>
          <h1 className="text-4xl md:text-5xl font-bold leading-[1.1] tracking-tight">
            Tell us who you want to reach.
          </h1>
          <p className="mt-5 text-lg text-muted leading-relaxed">
            We&apos;ll tell you honestly whether we have them. If our network is too small for what
            you need, you&apos;ll hear that in the first reply rather than the third meeting.
          </p>

          <div className="mt-8 space-y-3">
            <Point icon="grid" title={`${nf(placements)} placements`}>
              Across clustergg.com and inside every opted-in Discord server.
            </Point>
            <Point icon="trophy" title={`${nf(cfg.games * cfg.challengesPerGame)} challenges a month`}>
              {cfg.challengesPerGame} per game, per month — {money(cfg.prizePool, cfg.currency)} minimum prize pool each, funded and paid by us.
            </Point>
            <Point icon="gamepad" title={`${nf(games.length || cfg.games)} games`}>
              Every account verified against the game&apos;s own API. Nothing is self-reported.
            </Point>
            {network.reach > 0 && (
              <Point icon="users" title={`${nf(network.reach)} gamers reachable`}>
                The combined membership of every Discord server running ClusterBot.
              </Point>
            )}
          </div>

          <div className="mt-8 glass rounded-2xl p-5">
            <div className="text-sm font-semibold">Prefer to read first?</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/pricing" className="ghost-btn pressable rounded-full px-4 py-2 text-sm">Full rate card</Link>
              <Link href="/dataroom/company-profile" className="ghost-btn pressable rounded-full px-4 py-2 text-sm">Partner profile</Link>
              <Link href="/servers" className="ghost-btn pressable rounded-full px-4 py-2 text-sm">The communities</Link>
            </div>
            <p className="text-xs text-muted mt-4">
              Everything from {money(cfg.reachBase, cfg.currency)}/month to {money(full.monthly, cfg.currency)}/month
              for the whole network. Or email{" "}
              <a href={`mailto:${copy["pricing.contact.email"]}`} className="text-cyan-300 hover:underline">
                {copy["pricing.contact.email"]}
              </a>.
            </p>
          </div>
        </div>

        <EnquiryForm cfg={cfg} initialGames={initialGames} initialAddon={initialAddon} initialYearly={initialYearly} />
      </div>
    </div>
  );
}

function Point({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-9 w-9 rounded-xl bg-violet-500/15 border border-violet-400/25 grid place-items-center shrink-0">
        <Icon name={icon} size={16} className="text-violet-200" />
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-sm">{title}</div>
        <p className="text-sm text-muted leading-snug mt-0.5">{children}</p>
      </div>
    </div>
  );
}
