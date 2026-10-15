import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Inventory data must be fresh on every request, so pages render at request time.
  cacheComponents: false,
  devIndicators: { position: "bottom-right" },
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
