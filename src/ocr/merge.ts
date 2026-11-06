// Joins the results of the two OCR passes (docs/OCR_PAYMENTS.md section 4, "Merge").
// Prefer the pass 2 value (digits only) when it has the expected format, else the pass 1 value, else empty.
import { centavosToInput, parseAmount } from "./parsers/shared";
import type { FieldGuess, ParsedFields, ReceiptParser } from "./parsers/types";

export type FieldSource = "pass2" | "pass1" | "none";

export type MergedField = { value: string; confidence: number; source: FieldSource };
export type MergedFields = { reference: MergedField; amount: MergedField; date: MergedField };

// Below this, the form shows "Not sure - please check" with a yellow border.
export const LOW_CONFIDENCE = 0.6;

const NONE: MergedField = { value: "", confidence: 0, source: "none" };

function mergeOne(
  pass1: FieldGuess,
  pass2: string | null | undefined,
  isGood: (value: string) => boolean,
  clean: (value: string) => string,
): MergedField {
  const second = pass2 ? clean(pass2) : "";
  if (second && isGood(second)) {
    // Both passes agree: more sure. Different: take pass 2, but be less sure.
    const agree = pass1.value !== null && clean(pass1.value) === second;
    return { value: second, confidence: agree ? 0.95 : 0.7, source: "pass2" };
  }
  if (pass1.value) return { value: pass1.value, confidence: pass1.confidence, source: "pass1" };
  return NONE;
}

export function mergePasses(
  parser: ReceiptParser,
  pass1: ParsedFields,
  pass2: { reference?: string | null; amount?: string | null },
): MergedFields {
  const referenceOk = (value: string) =>
    value.length >= 6 &&
    value.length <= 30 &&
    (parser.referencePattern ? parser.referencePattern.test(value) : /^[A-Z0-9]+$/.test(value));

  return {
    reference: mergeOne(pass1.reference, pass2.reference, referenceOk, (v) =>
      parser.normalizeReference(v),
    ),
    amount: mergeOne(
      pass1.amount,
      pass2.amount,
      (value) => parseAmount(value) !== null,
      (value) => {
        const centavos = parseAmount(value);
        return centavos === null ? "" : centavosToInput(centavos);
      },
    ),
    date: pass1.date.value
      ? { value: pass1.date.value, confidence: pass1.date.confidence, source: "pass1" }
      : NONE,
  };
}
