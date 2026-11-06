import type { NextConfig } from "next";

import { securityHeaders } from "./src/lib/security-headers";

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
  // Security headers for every page (CSP, HSTS, frame-ancestors, referrer policy). See src/lib/security-headers.ts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          development: process.env.NODE_ENV !== "production",
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        }),
      },
    ];
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
