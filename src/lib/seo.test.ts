import { describe, expect, it } from "vitest";

import { breadcrumbJsonLd, serviceJsonLd, trimDescription } from "./seo";

describe("trimDescription", () => {
  it("keeps short text and cuts long text at a word", () => {
    expect(trimDescription("Short text.")).toBe("Short text.");
    const long = "word ".repeat(60);
    const result = trimDescription(long);
    expect(result.length).toBeLessThanOrEqual(155);
    expect(result.endsWith("...")).toBe(true);
  });
});

describe("serviceJsonLd", () => {
  const base = "https://example.com";
  it("adds a price in pesos only when a fee is set", () => {
    const withFee = serviceJsonLd(base, {
      slug: "a",
      name: "A",
      description: "d",
      feeCentavos: 500000,
    });
    expect(withFee.offers).toMatchObject({ price: "5000.00", priceCurrency: "PHP" });
    const noFee = serviceJsonLd(base, {
      slug: "a",
      name: "A",
      description: "d",
      feeCentavos: null,
    });
    expect("offers" in noFee).toBe(false);
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers the steps from 1 with full addresses", () => {
    const data = breadcrumbJsonLd("https://example.com", [
      { name: "Home", path: "/" },
      { name: "Services", path: "/services" },
    ]);
    expect(data.itemListElement[1]).toMatchObject({
      position: 2,
      item: "https://example.com/services",
    });
  });
});
