import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LOW_CONFIDENCE, mergePasses } from "./merge";
import { PARSERS, getParser } from "./parsers";
import {
  centavosToInput,
  findLabel,
  fixDigitLookalikes,
  parseAmount,
  parseDate,
  regionRightOf,
} from "./parsers/shared";
import type { OcrPage } from "./parsers/types";

// Builds an OCR result object from lines of text (fake positions, one line every 30 px).
function pageFrom(lines: string[]): OcrPage {
  return {
    text: lines.join("\n"),
    lines: lines.map((text, i) => ({
      text,
      words: [],
      bbox: { x0: 10, y0: i * 30, x1: 10 + text.length * 12, y1: i * 30 + 24 },
    })),
  };
}

describe("parseAmount", () => {
  it.each([
    ["₱1,250.00", 125000],
    ["PHP 1250", 125000],
    ["P 1,250", 125000],
    ["1.250,00", 125000], // comma as decimal
    ["1,250.5", 125050],
    ["₱0.05", 5],
    ["2500", 250000],
    ["1.250", 125000], // three digits after one dot: thousands
    ["12,345,678.90", 1234567890],
  ])("reads %s as %i centavos", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(["", "abc", "₱", "0", "0.00", "...", "-"])("returns null for %j", (input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it("makes the text for the amount field", () => {
    expect(centavosToInput(125000)).toBe("1250.00");
    expect(centavosToInput(5)).toBe("0.05");
    expect(centavosToInput(125050)).toBe("1250.50");
  });
});

describe("parseDate", () => {
  it.each([
    ["Nov 6, 2026", "2026-11-06"],
    ["Nov 6, 2026 9:37 AM", "2026-11-06"],
    ["November 6 2026", "2026-11-06"],
    ["11/06/2026", "2026-11-06"],
    ["2026-11-06", "2026-11-06"],
    ["06 Nov 2026", "2026-11-06"],
    ["6th Nov. 2026", null], // not a format we know: better empty than wrong
  ])("reads %s", (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it("refuses dates that do not exist", () => {
    expect(parseDate("Feb 30, 2026")).toBeNull();
    expect(parseDate("13/45/2026")).toBeNull();
    expect(parseDate("hello")).toBeNull();
  });
});

describe("fixDigitLookalikes", () => {
  it("changes look-alike letters to digits", () => {
    expect(fixDigitLookalikes("1O5S")).toBe("1055");
    expect(fixDigitLookalikes("l23B")).toBe("1238");
    expect(fixDigitLookalikes("Z0Z")).toBe("202");
  });
  it("leaves real digits alone", () => {
    expect(fixDigitLookalikes("0123456789")).toBe("0123456789");
  });
});

describe("findLabel and regions", () => {
  it("finds a label and the text after it", () => {
    const hit = findLabel(pageFrom(["Hello", "Ref No.: 123"]), /ref\.?\s*no\.?/i);
    expect(hit?.index).toBe(1);
    expect(hit?.after).toBe("123");
  });
  it("returns null when there is no label", () => {
    expect(findLabel(pageFrom(["Hello"]), /ref/i)).toBeNull();
  });
  it("makes a region to the right of a label", () => {
    expect(regionRightOf({ x0: 0, y0: 10, x1: 100, y1: 30 }).x0).toBe(100);
  });
});

describe("receipt parsers (fixtures: fake sample text)", () => {
  const root = path.resolve(__dirname, "../../tests/fixtures/receipts");

  for (const app of readdirSync(root)) {
    const parser = getParser(app);
    describe(app, () => {
      it("has a parser", () => {
        expect(parser).not.toBeNull();
      });
      for (const file of readdirSync(path.join(root, app))) {
        const fixture = JSON.parse(readFileSync(path.join(root, app, file), "utf8"));
        it(`reads ${file}`, () => {
          const page = pageFrom(fixture.lines);
          const fields = parser!.findFields(page);
          expect(parser!.matches(page)).toBe(fixture.expected.matches);
          expect(fields.reference.value).toBe(fixture.expected.reference);
          expect(fields.amount.value).toBe(fixture.expected.amount);
          expect(fields.date.value).toBe(fixture.expected.date);
        });
      }
    });
  }

  it("gives a low match score for another app's receipt", () => {
    const mayaReceipt = pageFrom(["maya", "Amount PHP 100", "Reference ID AB12CD34EF56"]);
    expect(getParser("gcash")!.matches(mayaReceipt)).toBe(0);
    expect(getParser("maya")!.matches(mayaReceipt)).toBe(1);
  });

  it("does not crash on empty or strange input", () => {
    for (const parser of PARSERS) {
      const fields = parser.findFields(pageFrom([]));
      expect(fields.reference.value).toBeNull();
      expect(fields.amount.value).toBeNull();
      expect(fields.date.value).toBeNull();
      expect(() =>
        parser.findFields(pageFrom(["", "   ", "💥 ₱ ₱ ₱", "Amount", "Ref No."])),
      ).not.toThrow();
    }
  });

  it("knows no parser for a method without parser_key", () => {
    expect(getParser(null)).toBeNull();
    expect(getParser("unknown-bank")).toBeNull();
  });

  it("normalizes references: digit-only apps fix look-alikes, letter apps do not", () => {
    expect(getParser("gcash")!.normalizeReference("12O4 567S-9O12")).toBe("120456759012");
    expect(getParser("maya")!.normalizeReference("ab12-cd34 ef56")).toBe("AB12CD34EF56");
  });
});

describe("mergePasses", () => {
  const gcash = getParser("gcash")!;
  const pass1 = gcash.findFields(
    pageFrom(["GCash", "Amount Sent ₱1,250.00", "Ref No. 1234 5678 9012", "Nov 6, 2026"]),
  );

  it("uses pass 2 when it has a good format, and is more sure when both agree", () => {
    const merged = mergePasses(gcash, pass1, { reference: "123456789012", amount: "1,250.00" });
    expect(merged.reference).toMatchObject({
      value: "123456789012",
      source: "pass2",
      confidence: 0.95,
    });
    expect(merged.amount).toMatchObject({ value: "1250.00", source: "pass2" });
    expect(merged.date.value).toBe("2026-11-06");
  });

  it("falls back to pass 1 when pass 2 is bad or empty", () => {
    const merged = mergePasses(gcash, pass1, { reference: "12", amount: "" });
    expect(merged.reference.source).toBe("pass1");
    expect(merged.reference.value).toBe("123456789012");
    expect(merged.amount.source).toBe("pass1");
  });

  it("marks a field as low confidence when the passes disagree or are weak", () => {
    const merged = mergePasses(gcash, pass1, { reference: "999999999999", amount: "1250" });
    expect(merged.reference.confidence).toBeLessThan(0.95);
    expect(LOW_CONFIDENCE).toBeGreaterThan(0.5);
  });

  it("gives empty fields when nothing was found", () => {
    const empty = gcash.findFields(pageFrom([]));
    const merged = mergePasses(gcash, empty, {});
    expect(merged.reference).toEqual({ value: "", confidence: 0, source: "none" });
  });
});
