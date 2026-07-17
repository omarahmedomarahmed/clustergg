import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import Starfield from "@/components/Starfield";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import QuestOrbMount from "@/components/QuestOrbMount";
import RouteProgress from "@/components/RouteProgress";
import PageBackground from "@/components/PageBackground";
import { getContent } from "@/lib/cms";
import { PAGE_BG_KEYS, pageBgCmsKeys } from "@/lib/page-bg";

const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://clustergg.com";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Cluster — Every game. One identity.", template: "%s · Cluster" },
  description:
    "Link every game account you own — Chess.com, Lichess, Dota 2, Steam, Riot, Fortnite and more — into one shareable gamer profile. Compete in challenges, earn cosmic badges, climb real leaderboards.",
  openGraph: {
    title: "Cluster — Every game. One identity.",
    description: "One cosmic profile for every game you play. Real stats, real leaderboards, real challenges.",
    url: appUrl,
    siteName: "Cluster",
    images: [{ url: "/assets/og.png", width: 1200, height: 675 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/assets/og.png"] },
  icons: { icon: "/assets/logo.png" },
};

export const viewport: Viewport = { themeColor: "#04051a" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-page custom backgrounds (Admin → Page backgrounds). Fetched once here
  // and handed to a client picker so navigation never re-fetches.
  const bgContent = await getContent(pageBgCmsKeys).catch(() => ({} as Record<string, string>));
  const bgMap: Record<string, string> = {};
  for (const k of PAGE_BG_KEYS) bgMap[k] = bgContent[`page.bg.${k}`] || "";

  return (
    <html lang="en" className={grotesk.variable}>
      <body className="nebula-bg min-h-screen antialiased">
        <RouteProgress />
        <PageBackground map={bgMap} />
        <Starfield />
        <div className="relative z-10 flex min-h-screen flex-col">
          <Nav />
          {/* The global top ad now lives *inside* each page's hero (over the
              hero artwork) via <TopBannerAd>, so it blends with the page rather
              than sitting on the plain site backdrop. */}
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
        <QuestOrbMount />
        <CookieConsent />
      </body>
    </html>
  );
}
