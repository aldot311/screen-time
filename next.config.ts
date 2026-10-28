import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads live run state per request, so the Cache Components model is off.
  // Forwarded browser logs were feeding a dev reload loop (each page load logged, rebuilt, reloaded).
  logging: { browserToTerminal: false },
  devIndicators: false,
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
