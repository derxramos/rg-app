import { describe, expect, it } from "vitest";

import { safeContactUrl } from "./contact-links";

describe("safeContactUrl", () => {
  it("accepts https and viber links", () => {
    expect(safeContactUrl("https://m.me/rgbookkeeping")).toBe("https://m.me/rgbookkeeping");
    expect(safeContactUrl("viber://chat?number=%2B639170000000")).toContain("viber://");
  });

  it("trims spaces around the link", () => {
    expect(safeContactUrl("  https://m.me/rg  ")).toBe("https://m.me/rg");
  });

  it("returns null for empty values", () => {
    expect(safeContactUrl("")).toBeNull();
    expect(safeContactUrl("   ")).toBeNull();
    expect(safeContactUrl(null)).toBeNull();
    expect(safeContactUrl(undefined)).toBeNull();
  });

  it("rejects unsafe or unexpected link types", () => {
    expect(safeContactUrl("javascript:alert(1)")).toBeNull();
    expect(safeContactUrl("data:text/html,hello")).toBeNull();
    expect(safeContactUrl("http://example.com")).toBeNull();
    expect(safeContactUrl("not a link")).toBeNull();
  });
});
