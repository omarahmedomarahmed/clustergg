import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import Starfield from "@/components/Starfield";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import QuestOrbMount from "@/components/QuestOrbMount";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={grotesk.variable}>
      <body className="nebula-bg min-h-screen antialiased">
        <Starfield />
        <div className="relative z-10 flex min-h-screen flex-col">
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
        <QuestOrbMount />
        <CookieConsent />
      </body>
    </html>
  );
}
