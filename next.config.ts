import type { NextConfig } from "next";

// Higgsfield-generated brand assets (cosmic identity pack). Served through
// same-origin rewrites; drop real files into public/assets/ to override.
const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082";
const ASSETS: Record<string, string> = {
  "/assets/hero.png": `${CDN}/hf_20260710_145725_dffb17ff-3d2b-4e24-9f6b-a160a4de4abd.png`,
  "/assets/logo.png": `${CDN}/hf_20260710_145728_efccfe24-d221-4768-9426-e3587a9ad6d0.png`,
  "/assets/badges.png": `${CDN}/hf_20260710_145730_5995545c-4e30-49fb-8857-4bfdad11f05f.png`,
  "/assets/ambient.png": `${CDN}/hf_20260710_145732_1c8e460d-6369-4567-9feb-ba372c49499b.png`,
  "/assets/og.png": `${CDN}/hf_20260710_145736_c76f07fb-ec1a-4aa4-9a99-4596e919a55c.png`,
};

const nextConfig: NextConfig = {
  async rewrites() {
    return Object.entries(ASSETS).map(([source, destination]) => ({ source, destination }));
  },
  // Brand art / static images rarely change — let browsers keep them for a year
  // so they don't re-download on every navigation (pages stay dynamic; images
  // don't). Uploaded art is separately cached long-lived at the Blob layer.
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  // `pg` is a SERVER-ONLY driver, and Next has to be told so explicitly.
  //
  // Adding node-postgres (so the money paths can be tested against a real
  // Postgres with real connections) broke the build, and the reason is §0's
  // oldest trap: Next traces the module graph across the client boundary even
  // for a dynamic `await import()`. `lib/db/index.ts` is legitimately reachable
  // from many client components, so `fs`, `net`, `dns` and `tls` all started
  // being resolved for the BROWSER bundle. `tsc` stayed green throughout.
  //
  // Chasing each import chain would be the wrong fix — the chains are
  // legitimate. The right one is that a Postgres socket driver must not resolve
  // in a browser bundle at all. It is never called there: the code path is
  // behind `process.env.DATABASE_URL`, which does not exist in the client.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "ws"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      // ALIAS, not `fallback`. `fallback` only fires for a request webpack
      // cannot resolve, and `pg` resolves perfectly well — it is right there in
      // node_modules. Aliasing it to `false` is what actually replaces it with
      // an empty module in the browser bundle. Tried fallback first; the build
      // stayed red and named `util/types`, which is the giveaway that the
      // package was still being followed.
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        pg: false, "pg-native": false, "pg-cloudflare": false, ws: false,
      };
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false, net: false, dns: false, tls: false, "util/types": false,
      };
    }
    return config;
  },
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@electric-sql/pglite/dist/**"],
  },
  images: {
    // ===== B103: NOT `hostname: "**"` =====
    //
    // It was. That makes `/_next/image?url=…` an OPEN IMAGE PROXY: anybody can
    // fetch any https URL on the internet through our domain and our bill.
    // Three things it costs, in order of how much they cost:
    //
    //   1. Bandwidth and Fast Origin Transfer, which is metered and is ours.
    //   2. Laundering. Content served from clustergg.com is content people
    //      reasonably believe came from us — including content we would never
    //      host, sitting behind our TLS certificate.
    //   3. A fetch primitive pointed wherever somebody likes, from inside our
    //      network, with our egress address.
    //
    // So it is a LIST, and adding to it is a deliberate act. Anything not here
    // renders as a broken image rather than as a proxy — a visible failure on
    // one picture, which is the cheap end of getting this wrong. The expensive
    // end is the other way round.
    //
    // `EXTRA_IMAGE_HOSTS` is a comma-separated escape hatch for a deployment
    // with its own CDN, so nobody has to edit and redeploy this file to add one
    // — and so nobody reaches for `**` again when they are in a hurry.
    remotePatterns: [
      // Our own storage. Blob mints a new URL per upload, which is why the
      // cache TTL below can be a month.
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // Art generated for us, and the older bucket it used to land in.
      { protocol: "https", hostname: "d8j0ntlcm91z4.cloudfront.net" },
      { protocol: "https", hostname: "d3u0tzju9qaucj.cloudfront.net" },
      // Discord: avatars, server icons, attachments the bot renders.
      { protocol: "https", hostname: "cdn.discordapp.com" },
      { protocol: "https", hostname: "media.discordapp.net" },
      // Game providers whose art we show beside a linked account.
      { protocol: "https", hostname: "ddragon.leagueoflegends.com" },
      { protocol: "https", hostname: "*.rgapi.com" },
      { protocol: "https", hostname: "avatars.steamstatic.com" },
      { protocol: "https", hostname: "*.akamai.steamstatic.com" },
      { protocol: "https", hostname: "cdn.cloudflare.steamstatic.com" },
      { protocol: "https", hostname: "steamcdn-a.akamaihd.net" },
      { protocol: "https", hostname: "osu.ppy.sh" },
      { protocol: "https", hostname: "a.ppy.sh" },
      { protocol: "https", hostname: "lichess1.org" },
      { protocol: "https", hostname: "images.chesscomfiles.com" },
      { protocol: "https", hostname: "tr.rbxcdn.com" },
      { protocol: "https", hostname: "fortnite-api.com" },
      { protocol: "https", hostname: "media.fortniteapi.io" },
      { protocol: "https", hostname: "www.speedrun.com" },
      ...(process.env.EXTRA_IMAGE_HOSTS ?? "")
        .split(",").map((h) => h.trim()).filter(Boolean)
        .map((hostname) => ({ protocol: "https" as const, hostname })),
    ],
    // Every Blob read counts against Fast Origin Transfer (10 GB on Hobby), and
    // Next's default only caches an optimized image for 60 SECONDS — so a
    // background on a busy page gets re-fetched from Blob and re-encoded every
    // minute, forever. Uploaded art is effectively immutable (re-uploading
    // mints a new URL), so it can be cached for a month. This is the single
    // highest-leverage line in the file for the bill.
    minimumCacheTTL: 2678400, // 31 days
  },
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
