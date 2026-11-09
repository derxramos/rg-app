import { bdoParser } from "./bdo";
import { gcashParser } from "./gcash";
import { mayaParser } from "./maya";
import type { ReceiptParser } from "./types";

// Adding an app = write a file, add it to this list, add fixtures and tests.
export const PARSERS: readonly ReceiptParser[] = [gcashParser, mayaParser, bdoParser];

export function getParser(key: string | null | undefined): ReceiptParser | null {
  return PARSERS.find((parser) => parser.key === key) ?? null;
}

// The receipt reader picks the parser by itself from the words on the receipt (see src/ocr/engine.ts).
// This helper only guesses from the payment method NAME, for small hints such as the keyboard type
// and the reference number check. "GCash Personal" finds GCash. An unknown name (RCBC, GoTyme...) finds none.
export function parserForMethodName(name: string | null | undefined): ReceiptParser | null {
  const lower = (name ?? "").toLowerCase();
  return PARSERS.find((parser) => lower.includes(parser.key)) ?? null;
}
