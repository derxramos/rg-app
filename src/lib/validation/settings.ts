// Zod schemas for site_settings values. One schema per key (docs/DATABASE.md, "site_settings").
// The same schemas are used by the seed script, the server, and later the admin forms.

import { z } from "zod";

// A link the owner pastes in. Empty is allowed (the button is then hidden).
const optionalLink = z.string().trim().max(500).default("");

export const SETTING_SCHEMAS = {
  contact: z.object({
    phone: z.string().trim().max(40).default(""),
    email: z.string().trim().max(200).default(""),
    address: z.string().trim().max(500).default(""),
  }),
  business_hours: z.object({
    text: z.string().trim().max(500).default(""),
  }),
  social_links: z.object({
    messenger: optionalLink,
    viber: optionalLink,
  }),
  home_texts: z.object({
    headline: z.string().trim().max(200).default(""),
    intro: z.string().trim().max(1000).default(""),
  }),
  file_retention_days: z.number().int().min(1).max(365),
  max_files_per_request: z.number().int().min(1).max(50),
  max_file_size_mb: z.number().int().min(1).max(10),
  storage_warning_percent: z.number().int().min(1).max(94),
  privacy_notice_version: z.string().trim().min(1).max(40),
  // ISO time text, or null when the job has not run yet.
  last_keep_alive_at: z.string().datetime().nullable(),
  last_cleanup_at: z.string().datetime().nullable(),
};

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

export const SETTING_KEYS = Object.keys(SETTING_SCHEMAS) as SettingKey[];

// Starting values. Numbers match docs/DATABASE.md. Text starts empty: the owner fills it in.
// Do not put invented business details, requirements, or fees here.
export const DEFAULT_SETTINGS: { [K in SettingKey]: SettingValue<K> } = {
  // The business's public contact details (they are shown on the website anyway). The owner can change them in the admin area.
  contact: {
    phone: "+63 991 234 8299",
    email: "rgsbookkeeping73@gmail.com",
    address: "P. Zamora St. Pob. 17, Batangas City, Philippines 4200",
  },
  business_hours: { text: "" },
  // Viber is shown as a number (not a button). No Messenger link was given yet: the button stays hidden until the owner adds one.
  social_links: { messenger: "", viber: "+63 991 234 8299" },
  home_texts: { headline: "RG'S Bookkeeping and Accounting Services", intro: "" },
  file_retention_days: 30,
  max_files_per_request: 15,
  max_file_size_mb: 3,
  storage_warning_percent: 80,
  // Draft version. The owner replaces it when the real privacy notice is approved.
  privacy_notice_version: "1.0",
  last_keep_alive_at: null,
  last_cleanup_at: null,
};

// Checks one value against the schema for its key. Throws a ZodError when it is wrong.
export function parseSetting<K extends SettingKey>(key: K, value: unknown): SettingValue<K> {
  return SETTING_SCHEMAS[key].parse(value) as SettingValue<K>;
}
