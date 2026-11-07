import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo";

// Web app manifest: name and colors when a phone user adds the site to the home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "RG'S Bookkeeping",
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "browser",
    background_color: "#ffffff",
    theme_color: "#0b6158",
    lang: "en-PH",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
