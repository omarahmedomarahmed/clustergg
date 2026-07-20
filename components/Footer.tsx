import Link from "next/link";
import { getContent } from "@/lib/cms";
import { getT } from "@/lib/i18n/t-server";
import BrandHeader from "@/components/BrandHeader";
import AppStoreBadges from "@/components/AppStoreBadges";

export default async function Footer() {
  const c = await getContent(["footer.tagline", "brand.footer.bg"]);
  const footerBg = c["brand.footer.bg"];
  const { t } = await getT();
  return (
    <footer className="relative z-10 mt-20 border-t border-violet-500/15 bg-cover bg-center"
      style={footerBg ? { backgroundImage: `linear-gradient(rgba(4,5,26,0.86), rgba(4,5,26,0.92)), url(${footerBg})` } : undefined}>
      <div className="mx-auto max-w-6xl px-4 py-12 grid gap-8 sm:grid-cols-3 text-sm">
        <div>
          <div className="mb-3"><BrandHeader placement="footer" /></div>
          <p className="text-muted leading-relaxed">{c["footer.tagline"]}</p>
          <div className="mt-4"><AppStoreBadges className="items-start" /></div>
        </div>
        <div>
          <div className="font-semibold mb-3 text-ink">{t("footer.product")}</div>
          <ul className="space-y-2 text-muted">
            <li><Link href="/planets" className="hover:text-ink">{t("nav.planets")}</Link></li>
            <li><Link href="/leaderboards" className="hover:text-ink">{t("nav.leaderboards")}</Link></li>
            <li><Link href="/search" className="hover:text-ink">{t("common.findGamers")}</Link></li>
            <li><Link href="/signup" className="hover:text-ink">{t("nav.join")}</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3 text-ink">{t("footer.legal")}</div>
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
