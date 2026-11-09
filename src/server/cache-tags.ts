// Names of the cache tags for public content. When the admin changes content (Phase 5),
// it calls revalidateTag with the matching name so the public pages update at once.
export const CACHE_TAGS = {
  settings: "site-settings",
  services: "services",
  legal: "legal",
} as const;
