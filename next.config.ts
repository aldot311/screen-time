import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads live run state per request, so the Cache Components model is off.
  // Forwarded browser logs were feeding a dev reload loop (each page load logged, rebuilt, reloaded).
  logging: { browserToTerminal: false },
  devIndicators: false,
  // ffmpeg-static finds its binary next to its own file; bundling it rewrote that path to /ROOT/... and every in-app
  // run failed at "Prepare video". Load it with Node's require instead, and ship the binary with the routes that run.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/campaigns/**": ["./node_modules/ffmpeg-static/ffmpeg"],
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
