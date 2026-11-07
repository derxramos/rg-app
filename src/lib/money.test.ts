import { describe, expect, it } from "vitest";

import { centavosToPesoInput, formatFee, formatPesos, parsePesosToCentavos } from "./money";

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

describe("parsePesosToCentavos", () => {
  it("reads whole pesos, commas, the peso sign and centavos", () => {
    expect(parsePesosToCentavos("5000")).toBe(500000);
    expect(parsePesosToCentavos(" ₱5,000 ")).toBe(500000);
    expect(parsePesosToCentavos("1250.5")).toBe(125050);
    expect(parsePesosToCentavos("0.05")).toBe(5);
  });

  it("returns null for empty text and NaN for bad text", () => {
    expect(parsePesosToCentavos("")).toBeNull();
    expect(parsePesosToCentavos("  ")).toBeNull();
    for (const bad of ["abc", "-5", "1.234", "5 000", "1e3", "999999999999"])
      expect(parsePesosToCentavos(bad)).toBeNaN();
  });
});

describe("centavosToPesoInput and formatFee", () => {
  it("round-trips", () => {
    expect(centavosToPesoInput(null)).toBe("");
    expect(centavosToPesoInput(500000)).toBe("5000");
    expect(centavosToPesoInput(125005)).toBe("1250.05");
    expect(formatFee(500000)).toBe("₱5,000");
    expect(formatFee(125050)).toBe("₱1,250.50");
  });
});
