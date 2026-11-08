import type { MetadataRoute } from "next";

import { getBaseUrl } from "@/lib/site-url";
import { listActiveServices } from "@/server/services/site-content";

// Lists the public pages and every active service. Private pages (request, track, admin) are left out.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getBaseUrl();
  // Priority and change rate are hints for search engines. No date is given for fixed pages, because
  // we do not track when they change. Services have a real "last changed" date.
  const pages = [
    { path: "", priority: 1, changeFrequency: "weekly" as const },
    { path: "/services", priority: 0.9, changeFrequency: "weekly" as const },
    { path: "/how-it-works", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/contact", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
  ].map(({ path, ...rest }) => ({ url: `${base}${path}`, ...rest }));

  const services = await listActiveServices();
  return [
    ...pages,
    ...services.map((service) => ({
      url: `${base}/services/${service.slug}`,
      lastModified: service.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
