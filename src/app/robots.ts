import type { MetadataRoute } from "next";

import { getBaseUrl } from "@/lib/site-url";

// Search engines may read the public pages only. The request flow, tracking page, admin area
// and API are private or personal, so they are not listed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/request",
        "/track",
        "/account",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/auth",
        "/api",
        "/dev",
      ],
    },
    sitemap: `${getBaseUrl()}/sitemap.xml`,
  };
}
