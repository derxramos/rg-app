import "server-only";

import { eq } from "drizzle-orm";

import {
  DEFAULT_SETTINGS,
  parseSetting,
  type SettingKey,
  type SettingValue,
} from "@/lib/validation/settings";
import { siteSettings } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

// Reads one setting straight from the database (no cache). Use it in server actions and routes,
// where the value must be current. A missing row uses the default. A wrong value throws.
export async function readSetting<K extends SettingKey>(
  db: AppDb,
  key: K,
): Promise<SettingValue<K>> {
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .limit(1);
  return row ? parseSetting(key, row.value) : DEFAULT_SETTINGS[key];
}
