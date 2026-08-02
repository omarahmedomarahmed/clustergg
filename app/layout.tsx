import { Suspense } from "react";
import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import { EMBED_HEADER } from "@/middleware";
import { Space_Grotesk, Cairo } from "next/font/google";
import "./globals.css";
import { SITE_CARD } from "@/lib/og";
import { getLocale } from "@/lib/i18n/server";
import { getUiOverrides } from "@/lib/i18n/t-server";
import { dirOf } from "@/lib/i18n/locale";
import Starfield from "@/components/Starfield";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import { LocaleProvider } from "@/components/LocaleProvider";
import CookieConsent from "@/components/CookieConsent";
import FloatingOrbs from "@/components/FloatingOrbs";
import EmbedMode from "@/components/EmbedMode";
import RouteProgress from "@/components/RouteProgress";
import PageBackground from "@/components/PageBackground";
import { getContent } from "@/lib/cms";
import { parseBottomTabs } from "@/lib/mobile-nav";
import { getCurrentUser } from "@/lib/auth";
import { PAGE_BG_KEYS, pageBgCmsKeys } from "@/lib/page-bg";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });
// Arabic-capable webfont, applied when the site is in RTL/Arabic mode.
const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo" });

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://clustergg.com";

export async function generateMetadata(): Promise<Metadata> {
  // Admin-editable favicon (+ zoom): a zoomed favicon is wrapped in an SVG that
  // scales the uploaded image; zoom of 1 just uses the image directly.
  const c = await getContent(["brand.favicon", "brand.favicon.zoom"]).catch(() => ({} as Record<string, string>));
  const fav = c["brand.favicon"];
  const favZoom = Math.max(1, Math.min(3, Number(c["brand.favicon.zoom"]) || 1));
  let icon = "/assets/logo.png";
  if (fav) {
    if (favZoom !== 1) {
      const s = 100 * favZoom;
      const off = (100 - s) / 2;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><image href="${fav}" x="${off}" y="${off}" width="${s}" height="${s}" preserveAspectRatio="xMidYMid slice"/></svg>`;
      icon = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    } else {
      icon = fav;
    }
  }
  return {
    metadataBase: new URL(appUrl),
    // The default title and description are what a search result, a shared
    // link and a page with no metadata of its own all show, so they carry the
    // positioning rather than a feature list. Both audiences are in it on
    // purpose: a brand has to see what we sell, and a gamer has to see what
    // they get, because the same URL serves both.
    title: {
      default: "Cluster — monetize your Discord server, or advertise to gamers on it",
      template: "%s · Cluster",
    },
    description:
      "The media-buying and monetization layer for gaming communities. Server owners earn money from their Discord server without selling anything; brands advertise on Discord by sponsoring the weekly challenge — $250, of which $175 is prize money that reaches a gamer; gamers link every game they play into one profile and compete for real prizes.",
    openGraph: {
      title: "Cluster — monetize your Discord server, or advertise to gamers on it",
      description: "Sponsored weekly challenges inside gaming communities. Brands reach gamers. Owners earn. Gamers win real prizes.",
      url: appUrl,
      siteName: "Cluster",
      // The platform, drawn from live data — not a logo, and not a file that
      // has to be re-exported every time the product changes. `/assets/og.png`
      // used to be here and does not exist in this repository at all, so every
      // link that didn't override it previewed a 404.
      images: [{ url: SITE_CARD, width: 1200, height: 630, alt: "Cluster — every game, one identity" }],
      type: "website",
    },
    twitter: { card: "summary_large_image", images: [SITE_CARD] },
    icons: { icon },
  };
}

export const viewport: Viewport = { themeColor: "#04051a" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-page custom backgrounds (Admin → Page backgrounds). Fetched once here
  // and handed to a client picker so navigation never re-fetches.
  const bgContent = await getContent([...pageBgCmsKeys, "brand.cpIcon", "brand.nav.planetsIcon", "mobile.bottomnav"]).catch(() => ({} as Record<string, string>));
  const bgMap: Record<string, string> = {};
  for (const k of PAGE_BG_KEYS) bgMap[k] = bgContent[`page.bg.${k}`] || "";
  const cpIcon = bgContent["brand.cpIcon"];
  const planetsGlobe = bgContent["brand.nav.planetsIcon"] || "";
  const bottomTabs = parseBottomTabs(bgContent["mobile.bottomnav"]);
  const me = await getCurrentUser().catch(() => null);
  const locale = await getLocale(me?.locale);
  const dir = dirOf(locale);
  const uiOverrides = await getUiOverrides(locale);

  // Embed mode, decided on the server.
  //
  // `<EmbedMode>` sets this attribute from a client effect, which runs after
  // the first paint — so a framed profile rendered the entire site chrome, then
  // hid it. Inside a small iframe that flash IS the bug people report as "two
  // navs". The middleware promotes `?embed=1` to a request header precisely so
  // the attribute can be right in the first byte; the client component stays as
  // the fallback for client-side navigation, where middleware doesn't run.
  const embedded = (await headers()).get(EMBED_HEADER) === "1";

  return (
    <html
      lang={locale} dir={dir}
      className={`${grotesk.variable} ${cairo.variable}`}
      {...(embedded ? { "data-embed": "1" } : {})}
    >
      <body className={`nebula-bg min-h-screen antialiased ${locale === "ar" ? "font-arabic" : ""}`} style={cpIcon ? ({ ["--cp-icon" as string]: `url(${cpIcon})` }) : undefined}>
        <LocaleProvider locale={locale} overrides={uiOverrides}>
        <RouteProgress />
        <Suspense fallback={null}><EmbedMode /></Suspense>
        <PageBackground map={bgMap} />
        <Starfield />
        <div className="relative z-10 flex min-h-screen flex-col">
          <Nav />
          {/* The global top ad now lives *inside* each page's hero (over the
              hero artwork) via <TopBannerAd>, so it blends with the page rather
              than sitting on the plain site backdrop. */}
          <main className="flex-1 pb-20 md:pb-0">{children}</main>
          <Footer />
        </div>
        <div data-site-chrome>
          <BottomNav loggedIn={!!me} globeUrl={planetsGlobe} tabs={bottomTabs ?? undefined} />
          <FloatingOrbs />
          <CookieConsent />
        </div>
        </LocaleProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
