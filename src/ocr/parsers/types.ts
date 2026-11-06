// Types for receipt parsers. Source: docs/OCR_PAYMENTS.md section 5.
// Parsers are PURE: no Tesseract, no browser. Input is an OCR result object, output is field guesses.

export type Box = { x0: number; y0: number; x1: number; y1: number };

export type OcrWord = { text: string; confidence: number; bbox: Box };
export type OcrLine = { text: string; words: OcrWord[]; bbox: Box };
export type OcrPage = { text: string; lines: OcrLine[] };

export type FieldGuess = {
  // Best guess from pass 1, already in the form shape (amount "1250.00", date "2026-11-06").
  value: string | null;
  // Where pass 2 should look again (digits only). Null when there is nothing to re-read.
  region: Box | null;
  // 0 to 1.
  confidence: number;
};

export type ParsedFields = {
  reference: FieldGuess;
  amount: FieldGuess;
  date: FieldGuess;
};

export type ReceiptParser = {
  key: string;
  displayName: string;
  // Does this text look like this app's receipt? Score 0 to 1.
  matches(page: OcrPage): number;
  findFields(page: OcrPage): ParsedFields;
  // Characters allowed in the reference number during pass 2.
  referenceCharList: string;
  normalizeReference(raw: string): string;
  // Null until we have real sample receipts. Then it is the exact format of the reference number.
  referencePattern: RegExp | null;
};
