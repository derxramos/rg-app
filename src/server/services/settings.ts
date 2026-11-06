import "server-only";

import { eq } from "drizzle-orm";

import {
  DEFAULT_SETTINGS,
  parseSetting,
  type SettingKey,
  type SettingValue,
} from "@/lib/validation/settings";
import { getDb } from "@/server/db/client";
import { siteSettings } from "@/server/db/schema";

// Only these settings may be read by the public pages. Job times and file limits stay server-side.
export const PUBLIC_SETTING_KEYS = [
  "contact",
  "business_hours",
  "social_links",
  "home_texts",
  "privacy_notice_version",
] as const satisfies readonly SettingKey[];

export type PublicSettingKey = (typeof PUBLIC_SETTING_KEYS)[number];

// Reads one public setting. If the row is missing, the default is used.
// A bad value in the database throws, so the problem is seen and fixed instead of hidden.
export async function getPublicSetting<K extends PublicSettingKey>(
  key: K,
): Promise<SettingValue<K>> {
  const rows = await getDb()
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .limit(1);

  if (rows.length === 0) return DEFAULT_SETTINGS[key];
  return parseSetting(key, rows[0].value);
}
