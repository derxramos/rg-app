import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Cache profile for public content that comes from the database (services, settings).
  // Pages are rebuilt in the background at most every 5 minutes. In Phase 5 the admin area
  // also clears the cache at once with revalidateTag (see src/server/cache-tags.ts).
  cacheLife: {
    "site-content": {
      stale: 300,
      revalidate: 300,
      expire: 86400,
    },
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
