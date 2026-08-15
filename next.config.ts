import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PGlite ships WebAssembly and loads it by URL. Bundled into the server
  // build, webpack rewrites those URLs and its `fs` call is handed a `URL`
  // from a different realm, which fails with "must be of type string or
  // Buffer or URL. Received an instance of URL" — an error that reads as
  // impossible until you know why. Left external, it loads itself.
  serverExternalPackages: ["@electric-sql/pglite"],
  typedRoutes: false,
};

export default nextConfig;
