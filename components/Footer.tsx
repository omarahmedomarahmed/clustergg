import Link from "next/link";
import { getContent } from "@/lib/cms";
import BrandHeader from "@/components/BrandHeader";
import AddBotButton from "@/components/AddBotButton";
import AppStoreBadges from "@/components/AppStoreBadges";
import { optImg } from "@/lib/img";
import { FOOTER_SETTING_KEY, parseFooter } from "@/lib/site-chrome";

// Three audiences, three columns.
//
// The footer is where someone lands after reading, which is when they decide.
// A single "Product" list served the gamer and left the two people who bring
// money — a brand and a server owner — hunting for the page that was written
// for them.
export default async function Footer() {
  const c = await getContent(["footer.tagline", "brand.footer.bg", FOOTER_SETTING_KEY]);
  const footerBg = c["brand.footer.bg"];
  // Columns and links come from Admin → Site chrome. Adding a link used to be a
  // deploy, which is why the footer had exactly the links somebody happened to
  // think of on the day it was written.
  const columns = parseFooter(c[FOOTER_SETTING_KEY]);
  return (
    <footer className="relative z-10 mt-20 border-t border-violet-500/15 bg-cover bg-center"
      style={footerBg ? { backgroundImage: `linear-gradient(rgba(4,5,26,0.86), rgba(4,5,26,0.92)), url(${optImg(footerBg, 1200)})` } : undefined}>
      <div className="mx-auto max-w-6xl px-4 py-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="mb-3"><BrandHeader placement="footer" /></div>
          <p className="text-muted leading-relaxed">{c["footer.tagline"]}</p>
          <div className="mt-4"><AddBotButton label="Add ClusterBot to your server" /></div>
          <div className="mt-4"><AppStoreBadges className="items-start" /></div>
          {/* No language switch here (B24 — localization is PARKED, not removed).
              Offering Arabic while the pages themselves are being consolidated
              and rewritten means paying for the same copy twice and getting the
              Arabic wrong both times, so English is the working language until
              the product stops moving.
              The machinery is untouched and unused: lib/i18n, the
              locale-namespaced CMS keys and the per-entity translation columns
              all still resolve. Restarting is putting this control back, not
              rebuilding a translation layer — which is exactly why it was a
              pause rather than a removal. */}
        </div>
        {columns.map((col) => (
          <div key={col.title || col.links[0]?.href}>
            {col.title && <div className="font-semibold mb-3 text-ink">{col.title}</div>}
            <ul className="space-y-2 text-muted">
              {col.links.map((l) => (
                <li key={`${l.label}-${l.href}`}>
                  {/* Internal links prefetch through the router; an admin can
                      also point a link at another site, and that has to be a
                      plain anchor or Next tries to route to it. */}
                  {l.href.startsWith("/") ? (
                    <Link href={l.href} className="hover:text-ink">{l.label}</Link>
                  ) : (
                    <a href={l.href} className="hover:text-ink" target="_blank" rel="noreferrer">{l.label}</a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {/* B90.10. The rules, on every page, to all three audiences.
          They live in the footer rather than behind a "Legal" link because they
          are not legal text — they are how the product works, and the person
          who most needs them is the one deciding whether to bother. */}
      <div className="mx-auto max-w-6xl px-4 pb-8">
        <div className="rounded-2xl border border-white/10 bg-black/25 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <span className="font-semibold text-ink">Every rule, and why it exists:</span>
            <Link href="/rules/gamer" className="text-muted hover:text-ink">If you play</Link>
            <Link href="/rules/owner" className="text-muted hover:text-ink">If you run a server</Link>
            <Link href="/rules/brand" className="text-muted hover:text-ink">If you buy</Link>
            <span className="text-muted/70">
              Every figure on those pages is read from the code that enforces it.
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-violet-500/10 py-5 text-center text-xs text-muted/70">
        © {new Date().getFullYear()} Cluster · clustergg.com · Made among the stars
      </div>
    </footer>
  );
}
