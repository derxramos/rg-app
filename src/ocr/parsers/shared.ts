// Helpers shared by all receipt parsers (docs/OCR_PAYMENTS.md section 5).
import type { Box, OcrLine, OcrPage } from "./types";

// ---------- Amount ----------

// "₱1,250.00" -> 125000 (centavos). Handles "PHP 1250", "1,250", and "1.250,00" (comma as decimal).
// Returns null when it is not a usable positive amount. Never uses floating point for the result.
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[^\d.,]/g, "");
  if (!/\d/.test(cleaned)) return null;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let decimalIndex = -1;

  if (lastDot >= 0 && lastComma >= 0) {
    // Both: the one that comes last is the decimal mark.
    decimalIndex = Math.max(lastDot, lastComma);
  } else {
    const index = Math.max(lastDot, lastComma);
    if (index >= 0) {
      const mark = cleaned[index];
      const count = cleaned.split(mark).length - 1;
      const digitsAfter = cleaned.length - index - 1;
      // One mark followed by 1 or 2 digits is a decimal mark. Three digits means thousands ("1,250").
      if (count === 1 && digitsAfter >= 1 && digitsAfter <= 2) decimalIndex = index;
    }
  }

  const whole = (decimalIndex >= 0 ? cleaned.slice(0, decimalIndex) : cleaned).replace(/[.,]/g, "");
  const fraction = decimalIndex >= 0 ? cleaned.slice(decimalIndex + 1).replace(/[.,]/g, "") : "";
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) return null;

  const centavos = Number(whole || "0") * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(centavos) && centavos > 0 ? centavos : null;
}

// 125000 -> "1250.00" (the text for the amount field).
export function centavosToInput(centavos: number): string {
  const pesos = Math.floor(centavos / 100);
  const cents = String(centavos % 100).padStart(2, "0");
  return `${pesos}.${cents}`;
}

// ---------- Date ----------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function toIso(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100 || !isRealDate(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// "Nov 6, 2026 9:37 AM", "11/06/2026", "2026-11-06", "06 Nov 2026" -> "2026-11-06". Otherwise null.
// A number date like 11/06/2026 is read as month/day/year.
export function parseDate(input: string): string | null {
  const text = input.trim();

  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(text);
  if (m) return toIso(Number(m[3]), Number(m[1]), Number(m[2]));

  // "Nov 6, 2026" or "November 6 2026"
  m = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/.exec(text);
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    if (month > 0) return toIso(Number(m[3]), month, Number(m[2]));
  }

  // "06 Nov 2026"
  m = /\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/.exec(text);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    if (month > 0) return toIso(Number(m[3]), month, Number(m[1]));
  }
  return null;
}

// ---------- Digits ----------

// "1O5S" -> "1055". ONLY use this on fields that must be digits (never on whole receipts).
export function fixDigitLookalikes(input: string): string {
  const map: Record<string, string> = {
    O: "0",
    o: "0",
    Q: "0",
    D: "0",
    S: "5",
    s: "5",
    l: "1",
    I: "1",
    i: "1",
    "|": "1",
    B: "8",
    Z: "2",
    z: "2",
  };
  return input.replace(/[OoQDSslIi|BZz]/g, (c) => map[c] ?? c);
}

// ---------- Labels and regions ----------

export type LabelHit = { line: OcrLine; index: number; after: string };

// Finds the first line that has the label. `after` is the text on the same line after the label.
export function findLabel(page: OcrPage, pattern: RegExp): LabelHit | null {
  for (let index = 0; index < page.lines.length; index++) {
    const line = page.lines[index];
    const match = pattern.exec(line.text);
    if (match) {
      const after = line.text
        .slice(match.index + match[0].length)
        .replace(/^[\s:.\-–]+/, "")
        .trim();
      return { line, index, after };
    }
  }
  return null;
}

// The area to the right of a label (where the value usually is). The engine cuts it to the image size.
export function regionRightOf(box: Box, width = 700): Box {
  return { x0: box.x1, y0: box.y0 - 6, x1: box.x1 + width, y1: box.y1 + 6 };
}

// The area under a label (when the value is on the next line).
export function regionBelow(box: Box, width = 700, height = 60): Box {
  return { x0: box.x0, y0: box.y1, x1: box.x0 + width, y1: box.y1 + height };
}

// Stops people (and OCR mistakes) from putting strange characters into a reference number.
export function onlyLettersAndDigits(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "");
}
