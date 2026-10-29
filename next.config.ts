import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads live run state per request, so the Cache Components model is off.
  // Forwarded browser logs were feeding a dev reload loop (each page load logged, rebuilt, reloaded).
  logging: { browserToTerminal: false },
  devIndicators: false,
  // The proxy buffers request bodies it guards (10 MB by default), which cut off local direct video uploads. On Vercel
  // videos go straight to Blob, so this only matters for the local store.
  experimental: { proxyClientMaxBodySize: "210mb" },
  // ffmpeg-static finds its binary next to its own file; bundling it rewrote that path to /ROOT/... and every in-app
  // run failed at "Prepare video". Load it with Node's require instead, and ship the binary with the routes that run.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/campaigns/**": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
