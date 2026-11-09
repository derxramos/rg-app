import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, SETTING_KEYS, SETTING_SCHEMAS, parseSetting } from "./settings";

describe("site settings schemas", () => {
  it("accepts every default value", () => {
    for (const key of SETTING_KEYS) {
      expect(() => parseSetting(key, DEFAULT_SETTINGS[key])).not.toThrow();
    }
  });

  it("has a default for every key in docs/DATABASE.md", () => {
    expect([...SETTING_KEYS].sort()).toEqual(
      [
        "contact",
        "business_hours",
        "social_links",
        "home_texts",
        "file_retention_days",
        "max_files_per_request",
        "max_file_size_mb",
        "storage_warning_percent",
        "last_keep_alive_at",
        "last_cleanup_at",
      ].sort(),
    );
  });

  it("uses the documented starting numbers", () => {
    expect(DEFAULT_SETTINGS.file_retention_days).toBe(30);
    expect(DEFAULT_SETTINGS.max_files_per_request).toBe(15);
    expect(DEFAULT_SETTINGS.max_file_size_mb).toBe(3);
    expect(DEFAULT_SETTINGS.storage_warning_percent).toBe(80);
  });

  it("rejects numbers that are out of range or not whole", () => {
    expect(() => parseSetting("max_file_size_mb", 0)).toThrow();
    expect(() => parseSetting("max_file_size_mb", 2.5)).toThrow();
    expect(() => parseSetting("max_files_per_request", 500)).toThrow();
    expect(() => parseSetting("storage_warning_percent", 99)).toThrow();
    expect(() => parseSetting("file_retention_days", "30")).toThrow();
  });

  it("rejects text that is too long", () => {
    expect(() => parseSetting("home_texts", { headline: "x".repeat(201), intro: "" })).toThrow();
  });

  it("fills missing optional text with an empty string", () => {
    expect(SETTING_SCHEMAS.social_links.parse({})).toEqual({ messenger: "", viber: "" });
  });

  it("accepts a time or null for the job times, and nothing else", () => {
    expect(() => parseSetting("last_cleanup_at", "2026-11-06T01:37:00Z")).not.toThrow();
    expect(() => parseSetting("last_cleanup_at", null)).not.toThrow();
    expect(() => parseSetting("last_cleanup_at", "yesterday")).toThrow();
  });
});
