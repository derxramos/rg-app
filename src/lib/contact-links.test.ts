import { describe, expect, it } from "vitest";

import { contactChannelSentence, safeContactUrl, viberDisplayNumber } from "./contact-links";

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

describe("viberDisplayNumber", () => {
  it("reads the number from a viber link", () => {
    expect(viberDisplayNumber("viber://chat?number=%2B639912348299")).toBe("+63 991 234 8299");
  });

  it("accepts a plain number", () => {
    expect(viberDisplayNumber("+63 991 234 8299")).toBe("+63 991 234 8299");
  });

  it("returns null for empty or unusable values", () => {
    expect(viberDisplayNumber("")).toBeNull();
    expect(viberDisplayNumber(null)).toBeNull();
    expect(viberDisplayNumber("viber://chat")).toBeNull();
    expect(viberDisplayNumber("<script>alert(1)</script>")).toBeNull();
  });
});

describe("contactChannelSentence", () => {
  it("names only the channels that are set", () => {
    expect(contactChannelSentence({ messenger: true, viber: true })).toBe(
      "You can also write to us on Messenger or Viber.",
    );
    expect(contactChannelSentence({ messenger: false, viber: true })).toBe(
      "You can also write to us on Viber.",
    );
    expect(contactChannelSentence({ messenger: true, viber: false })).toBe(
      "You can also write to us on Messenger.",
    );
  });

  it("returns null when no channel is set", () => {
    expect(contactChannelSentence({ messenger: false, viber: false })).toBeNull();
  });
});
