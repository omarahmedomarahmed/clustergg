import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_APP_URL || "https://clustergg.com";

// What crawlers may read.
//
// AI crawlers are allowed on purpose. Cluster's whole discovery story is that
// someone asks an assistant "what's a good Discord bot for game stats" and gets
// a real answer — blocking GPTBot, ClaudeBot and PerplexityBot would remove us
// from that answer entirely while gaining nothing, since everything they'd read
// is already public and meant to be shared.
//
// What's blocked is what has no business being indexed: anything behind auth,
// anything key-gated, and the API surface. `/api/card/` is the exception —
// those PNGs are the OpenGraph images for shared links, so a crawler needs
// them to render a preview.
export default function robots(): MetadataRoute.Robots {
  const disallow = [
    "/admin",
    "/api/",
    "/settings/",
    "/profile",
    "/feed",
    "/messages",
    "/notifications",
    "/onboarding",
    "/brands/",   // key-gated advertiser portals
    "/servers/*/manage",
  ];

  return {
    rules: [
      { userAgent: "*", allow: ["/", "/api/card/"], disallow },
      // Named explicitly so the intent is on the record rather than inherited.
      { userAgent: ["GPTBot", "ClaudeBot", "Claude-Web", "PerplexityBot", "Google-Extended", "Applebot-Extended", "CCBot"], allow: "/", disallow },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
