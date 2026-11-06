import { describe, expect, it } from "vitest";

import { formatPesos } from "./money";

describe("formatPesos", () => {
  it("formats centavos with the peso sign, commas and two decimals", () => {
    expect(formatPesos(125000)).toBe("₱1,250.00");
    expect(formatPesos(15050)).toBe("₱150.50");
    expect(formatPesos(5)).toBe("₱0.05");
    expect(formatPesos(0)).toBe("₱0.00");
  });

  it("formats big amounts", () => {
    expect(formatPesos(10_000_000)).toBe("₱100,000.00");
    expect(formatPesos(123_456_789)).toBe("₱1,234,567.89");
  });

  it("formats negative amounts", () => {
    expect(formatPesos(-2500)).toBe("-₱25.00");
  });

  it("uses the real peso sign U+20B1", () => {
    expect(formatPesos(100).codePointAt(0)).toBe(0x20b1);
  });

  it("refuses fractions of a centavo", () => {
    expect(() => formatPesos(10.5)).toThrow(RangeError);
  });

  it("refuses values that are not real numbers", () => {
    expect(() => formatPesos(Number.NaN)).toThrow(RangeError);
    expect(() => formatPesos(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
