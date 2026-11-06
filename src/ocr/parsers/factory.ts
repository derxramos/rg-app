import {
  centavosToInput,
  findLabel,
  fixDigitLookalikes,
  onlyLettersAndDigits,
  parseAmount,
  parseDate,
  regionBelow,
  regionRightOf,
} from "./shared";
import type { FieldGuess, OcrPage, ParsedFields, ReceiptParser } from "./types";

type ParserConfig = {
  key: string;
  displayName: string;
  // Words that appear on this app's receipts. PLACEHOLDERS until we have real samples.
  brandWords: RegExp;
  referenceLabel: RegExp;
  amountLabel: RegExp;
  // Characters for the reference number in pass 2 (digits only unless the app uses letters).
  referenceCharList: string;
  // Null until real samples show the exact format.
  referencePattern: RegExp | null;
};

const EMPTY: FieldGuess = { value: null, region: null, confidence: 0 };

// Builds one parser from a small config. Adding an app = a new file with a config, plus fixtures and tests.
// IMPORTANT: real receipt formats are not known yet. The label patterns are placeholders
// (docs/OCR_PAYMENTS.md section 5). Tests use clearly fake sample text.
export function createParser(config: ParserConfig): ReceiptParser {
  const digitsOnly = /^[0-9]+$/.test(config.referenceCharList);

  const normalizeReference = (raw: string) => {
    const letters = onlyLettersAndDigits(raw).toUpperCase();
    // Where the app only uses digits, fix look-alikes: O becomes 0, S becomes 5, and so on.
    return digitsOnly ? fixDigitLookalikes(letters) : letters;
  };

  function findReference(page: OcrPage): FieldGuess {
    const hit = findLabel(page, config.referenceLabel);
    if (!hit) return EMPTY;
    const sameLine = normalizeReference(hit.after);
    if (sameLine.length >= 6) {
      return { value: sameLine, region: regionRightOf(hit.line.bbox), confidence: 0.8 };
    }
    const next = page.lines[hit.index + 1];
    const nextValue = next ? normalizeReference(next.text) : "";
    if (nextValue.length >= 6) {
      return { value: nextValue, region: regionBelow(hit.line.bbox), confidence: 0.5 };
    }
    return { value: null, region: regionRightOf(hit.line.bbox), confidence: 0 };
  }

  function findAmount(page: OcrPage): FieldGuess {
    const hit = findLabel(page, config.amountLabel);
    if (hit) {
      const same = parseAmount(hit.after);
      if (same)
        return {
          value: centavosToInput(same),
          region: regionRightOf(hit.line.bbox),
          confidence: 0.8,
        };
      const next = page.lines[hit.index + 1];
      const below = next ? parseAmount(next.text) : null;
      if (below)
        return {
          value: centavosToInput(below),
          region: regionBelow(hit.line.bbox),
          confidence: 0.5,
        };
    }
    // Last try: a line that has a peso sign or "PHP".
    for (const line of page.lines) {
      if (/₱|PHP/i.test(line.text)) {
        const found = parseAmount(line.text);
        if (found) return { value: centavosToInput(found), region: line.bbox, confidence: 0.4 };
      }
    }
    return EMPTY;
  }

  function findDate(page: OcrPage): FieldGuess {
    for (const line of page.lines) {
      const iso = parseDate(line.text);
      if (iso) return { value: iso, region: null, confidence: 0.7 };
    }
    return EMPTY;
  }

  return {
    key: config.key,
    displayName: config.displayName,
    matches: (page) => (config.brandWords.test(page.text) ? 1 : 0),
    findFields: (page): ParsedFields => ({
      reference: findReference(page),
      amount: findAmount(page),
      date: findDate(page),
    }),
    referenceCharList: config.referenceCharList,
    normalizeReference,
    referencePattern: config.referencePattern,
  };
}
