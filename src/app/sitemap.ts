import type { MetadataRoute } from "next";

import { getBaseUrl } from "@/lib/site-url";
import { listActiveServices } from "@/server/services/site-content";

// Lists the public pages and every active service. Private pages (request, track, admin) are left out.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getBaseUrl();
  const pages = ["", "/services", "/how-it-works", "/contact", "/privacy"].map((path) => ({
    url: `${base}${path}`,
  }));

  const services = await listActiveServices();
  return [...pages, ...services.map((service) => ({ url: `${base}/services/${service.slug}` }))];
}
