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

  it("falls back to localhost when the value is missing or empty", () => {
    vi.stubEnv("APP_BASE_URL", "   ");
    expect(getBaseUrl()).toBe("http://localhost:3000");
  });
});
