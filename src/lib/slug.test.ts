import { describe, expect, it } from "vitest";

import { slugify } from "./slug";

describe("slugify", () => {
  it("makes lower case words joined by dashes", () => {
    expect(slugify("Business Permit Registration")).toBe("business-permit-registration");
  });

  it("replaces symbols and removes extra dashes", () => {
    expect(slugify("  Tax  &  Payroll!! ")).toBe("tax-and-payroll");
  });

  it("removes accents", () => {
    expect(slugify("Peña Café")).toBe("pena-cafe");
  });

  it("returns an empty string when nothing is usable", () => {
    expect(slugify("!!!")).toBe("");
  });

  it("limits the length", () => {
    expect(slugify("a".repeat(200)).length).toBe(80);
  });
});
