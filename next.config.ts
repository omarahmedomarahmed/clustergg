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
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@electric-sql/pglite/dist/**"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
