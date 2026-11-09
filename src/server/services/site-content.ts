import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import {
  DEFAULT_SETTINGS,
  parseSetting,
  type SettingKey,
  type SettingValue,
} from "@/lib/validation/settings";
import type { LegalKind } from "@/lib/legal-text";
import { trimDescription } from "@/lib/seo";
import { CACHE_TAGS } from "@/server/cache-tags";
import { getDb } from "@/server/db/client";
import { serviceRequirements, services, siteSettings } from "@/server/db/schema";
import { getCurrentLegal, type LegalDocument } from "@/server/services/legal";

// Public content for the website pages. Everything here is safe to show to any visitor:
// no client data, no admin data. Results are cached (see the "site-content" profile in next.config.ts).
// A database error is NOT hidden: it throws, so it is never cached and the error page shows.

// ---------- Site settings ----------

export const PUBLIC_SETTING_KEYS = [
  "contact",
  "business_hours",
  "social_links",
  "home_texts",
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
    file_retention_days: read("file_retention_days"),
  };
}

// ---------- Privacy notice and Terms ----------

// The current text of a legal page (see legal.ts). Cached like the other public content, and the cache is
// cleared when the owner saves a new version.
export async function getPublicLegal(kind: LegalKind): Promise<LegalDocument> {
  "use cache";
  cacheLife("site-content");
  cacheTag(CACHE_TAGS.legal);

  return getCurrentLegal(getDb(), kind);
}

// ---------- Services ----------

export type PublicService = {
  slug: string;
  name: string;
  // The first words of the description, for the list cards (cut at a word).
  summary: string;
  // Whole centavos, or null when the owner has not set a fee yet.
  feeCentavos: number | null;
  // For the sitemap: when the service last changed.
  updatedAt: Date;
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

// The list card shows only the first words of the description. The owner writes one text, and the system cuts it.
const SUMMARY_LENGTH = 150;
const serviceSummary = (description: string) => trimDescription(description, SUMMARY_LENGTH);

// Active services only, in the order the admin chose.
export async function listActiveServices(): Promise<PublicService[]> {
  "use cache";
  cacheLife("site-content");
  cacheTag(CACHE_TAGS.services);

  const rows = await getDb()
    .select({
      slug: services.slug,
      name: services.name,
      description: services.description,
      feeCentavos: services.feeCentavos,
      updatedAt: services.updatedAt,
    })
    .from(services)
    .where(eq(services.isActive, true))
    .orderBy(asc(services.sortOrder), asc(services.name));
  return rows.map(({ description, ...rest }) => ({
    ...rest,
    summary: serviceSummary(description),
  }));
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
      description: services.description,
      feeCentavos: services.feeCentavos,
      updatedAt: services.updatedAt,
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
    summary: serviceSummary(service.description),
    feeCentavos: service.feeCentavos,
    updatedAt: service.updatedAt,
    description: service.description,
    requirements,
  };
}
