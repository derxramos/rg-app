import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import {
  DEFAULT_SETTINGS,
  parseSetting,
  type SettingKey,
  type SettingValue,
} from "@/lib/validation/settings";
import { CACHE_TAGS } from "@/server/cache-tags";
import { getDb } from "@/server/db/client";
import { serviceRequirements, services, siteSettings } from "@/server/db/schema";

// Public content for the website pages. Everything here is safe to show to any visitor:
// no client data, no admin data. Results are cached (see the "site-content" profile in next.config.ts).
// A database error is NOT hidden: it throws, so it is never cached and the error page shows.

// ---------- Site settings ----------

export const PUBLIC_SETTING_KEYS = [
  "contact",
  "business_hours",
  "social_links",
  "home_texts",
  "privacy_notice_version",
  "file_retention_days",
] as const satisfies readonly SettingKey[];

export type PublicSettings = { [K in (typeof PUBLIC_SETTING_KEYS)[number]]: SettingValue<K> };

// All public settings in one query. A missing row uses the default value.
export async function getPublicSettings(): Promise<PublicSettings> {
  "use cache";
  cacheLife("site-content");
  cacheTag(CACHE_TAGS.settings);

  const rows = await getDb()
    .select({ key: siteSettings.key, value: siteSettings.value })
    .from(siteSettings)
    .where(inArray(siteSettings.key, [...PUBLIC_SETTING_KEYS]));
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  const read = <K extends (typeof PUBLIC_SETTING_KEYS)[number]>(key: K): SettingValue<K> =>
    byKey.has(key) ? parseSetting(key, byKey.get(key)) : DEFAULT_SETTINGS[key];

  return {
    contact: read("contact"),
    business_hours: read("business_hours"),
    social_links: read("social_links"),
    home_texts: read("home_texts"),
    privacy_notice_version: read("privacy_notice_version"),
    file_retention_days: read("file_retention_days"),
  };
}

// ---------- Services ----------

export type PublicService = {
  slug: string;
  name: string;
  shortDescription: string;
};

export type PublicRequirement = {
  id: string;
  label: string;
  details: string | null;
  isRequired: boolean;
};

export type PublicServiceDetail = PublicService & {
  description: string;
  requirements: PublicRequirement[];
};

// Active services only, in the order the admin chose.
export async function listActiveServices(): Promise<PublicService[]> {
  "use cache";
  cacheLife("site-content");
  cacheTag(CACHE_TAGS.services);

  return getDb()
    .select({
      slug: services.slug,
      name: services.name,
      shortDescription: services.shortDescription,
    })
    .from(services)
    .where(eq(services.isActive, true))
    .orderBy(asc(services.sortOrder), asc(services.name));
}

// One active service with its checklist. Returns null when the slug is unknown or the service is off.
export async function getActiveService(slug: string): Promise<PublicServiceDetail | null> {
  "use cache";
  cacheLife("site-content");
  cacheTag(CACHE_TAGS.services);

  const db = getDb();
  const [service] = await db
    .select({
      id: services.id,
      slug: services.slug,
      name: services.name,
      shortDescription: services.shortDescription,
      description: services.description,
    })
    .from(services)
    .where(and(eq(services.slug, slug), eq(services.isActive, true)))
    .limit(1);
  if (!service) return null;

  const requirements = await db
    .select({
      id: serviceRequirements.id,
      label: serviceRequirements.label,
      details: serviceRequirements.details,
      isRequired: serviceRequirements.isRequired,
    })
    .from(serviceRequirements)
    .where(eq(serviceRequirements.serviceId, service.id))
    .orderBy(asc(serviceRequirements.sortOrder), asc(serviceRequirements.label));

  return {
    slug: service.slug,
    name: service.name,
    shortDescription: service.shortDescription,
    description: service.description,
    requirements,
  };
}
