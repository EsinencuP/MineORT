import type { NextConfig } from "next";

// Our own pictures never change under the same name for long, so the browser and the CDN may keep
// them for a week and refresh them in the background for another day (the default for files in
// public/ is to revalidate on every visit).
const STATIC_CACHE = "public, max-age=604800, stale-while-revalidate=86400";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return ["art", "brand", "community", "avatars"].map((dir) => ({
      source: `/${dir}/:path*`,
      headers: [{ key: "Cache-Control", value: STATIC_CACHE }],
    }));
  },
};

export default nextConfig;
