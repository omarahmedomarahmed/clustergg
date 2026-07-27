import Link from "next/link";
import { getContent } from "@/lib/cms";
import { getT } from "@/lib/i18n/t-server";
import BrandHeader from "@/components/BrandHeader";
import AddBotButton from "@/components/AddBotButton";
import AppStoreBadges from "@/components/AppStoreBadges";
import { optImg } from "@/lib/img";

// Three audiences, three columns.
//
// The footer is where someone lands after reading, which is when they decide.
// A single "Product" list served the gamer and left the two people who bring
// money — a brand and a server owner — hunting for the page that was written
// for them.
export default async function Footer() {
  const c = await getContent(["footer.tagline", "brand.footer.bg", "footer.brands.title", "footer.servers.title"]);
  const footerBg = c["brand.footer.bg"];
  const { t } = await getT();
  return (
    <footer className="relative z-10 mt-20 border-t border-violet-500/15 bg-cover bg-center"
      style={footerBg ? { backgroundImage: `linear-gradient(rgba(4,5,26,0.86), rgba(4,5,26,0.92)), url(${optImg(footerBg, 1200)})` } : undefined}>
      <div className="mx-auto max-w-6xl px-4 py-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="mb-3"><BrandHeader placement="footer" /></div>
          <p className="text-muted leading-relaxed">{c["footer.tagline"]}</p>
          <div className="mt-4"><AddBotButton label="Add ClusterBot to your server" /></div>
          <div className="mt-4"><AppStoreBadges className="items-start" /></div>
        </div>
        <div>
          <div className="font-semibold mb-3 text-ink">{c["footer.brands.title"] || "For brands"}</div>
          <ul className="space-y-2 text-muted">
            <li><Link href="/pricing" className="hover:text-ink">Pricing</Link></li>
            <li><Link href="/brands" className="hover:text-ink">Talk to us</Link></li>
            <li><Link href="/dataroom/company-profile" className="hover:text-ink">Partner profile</Link></li>
            <li><Link href="/pricing#plans" className="hover:text-ink">Sponsored challenges</Link></li>
            <li><Link href="/dataroom" className="hover:text-ink">Investors &amp; partners</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3 text-ink">{c["footer.servers.title"] || "For server owners"}</div>
          <ul className="space-y-2 text-muted">
            <li><Link href="/discord-bot" className="hover:text-ink">Add the bot</Link></li>
            <li><Link href="/servers" className="hover:text-ink">Monetize your server</Link></li>
            <li><Link href="/servers" className="hover:text-ink">Connected servers</Link></li>
            <li><Link href="/blog" className="hover:text-ink">Blog &amp; guides</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3 text-ink">{t("footer.product")}</div>
          <ul className="space-y-2 text-muted">
            <li><Link href="/planets" className="hover:text-ink">{t("nav.planets")}</Link></li>
            <li><Link href="/leaderboards" className="hover:text-ink">{t("nav.leaderboards")}</Link></li>
            <li><Link href="/search" className="hover:text-ink">{t("common.findGamers")}</Link></li>
            <li><Link href="/signup" className="hover:text-ink">{t("nav.join")}</Link></li>
          </ul>
          <div className="font-semibold mb-3 mt-6 text-ink">{t("footer.legal")}</div>
          <ul className="space-y-2 text-muted">
            <li><Link href="/legal/privacy" className="hover:text-ink">{t("footer.privacy")}</Link></li>
            <li><Link href="/legal/terms" className="hover:text-ink">{t("footer.terms")}</Link></li>
            <li><Link href="/legal/cookies" className="hover:text-ink">{t("footer.cookies")}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-violet-500/10 py-5 text-center text-xs text-muted/70">
        © {new Date().getFullYear()} Cluster · clustergg.com · Made among the stars
      </div>
    </footer>
  );
}
