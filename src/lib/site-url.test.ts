import { afterEach, describe, expect, it, vi } from "vitest";

import { getBaseUrl } from "./site-url";

describe("getBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses APP_BASE_URL without a trailing slash", () => {
    vi.stubEnv("APP_BASE_URL", "https://example.com/");
    expect(getBaseUrl()).toBe("https://example.com");
  });

  it("uses the Vercel production address when APP_BASE_URL is not set", () => {
    vi.stubEnv("APP_BASE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "rg-app.vercel.app");
    expect(getBaseUrl()).toBe("https://rg-app.vercel.app");
  });

  it("falls back to localhost when the value is missing or empty", () => {
    vi.stubEnv("APP_BASE_URL", "   ");
    expect(getBaseUrl()).toBe("http://localhost:3000");
  });
});
