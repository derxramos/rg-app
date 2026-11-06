// Server rules for a payment (docs/OCR_PAYMENTS.md section 7). Never trust the browser or OCR values.
import { z } from "zod";

import { addDaysToIsoDate } from "@/lib/time";
import { parseAmount } from "@/ocr/parsers/shared";
import type { ReceiptParser } from "@/ocr/parsers/types";

export const MAX_AMOUNT_CENTAVOS = 10_000_000; // 100,000 pesos. The owner can change this later.
export const MAX_PAYMENT_AGE_DAYS = 60;

export type PaymentField = "paymentMethodId" | "reference" | "amount" | "paidOn" | "confirmed";

export type PaymentRaw = {
  paymentMethodId: unknown;
  reference: unknown;
  amount: unknown;
  paidOn: unknown;
  confirmed: unknown;
  entryMethod: unknown;
  ocrRaw: unknown;
};

export type PaymentData = {
  paymentMethodId: string;
  reference: string;
  amountCentavos: number;
  paidOn: string;
  entryMethod: "ocr" | "ocr_edited" | "manual";
  ocrRawValues: { reference?: string; amount?: string; date?: string } | null;
};

export type PaymentResult =
  { ok: true; data: PaymentData } | { ok: false; errors: Partial<Record<PaymentField, string>> };

const short = z.string().trim().max(40);
const ocrRawSchema = z
  .object({ reference: short.optional(), amount: short.optional(), date: short.optional() })
  .nullable()
  .catch(null);

// today: "YYYY-MM-DD" in Asia/Manila. parser: the parser of the chosen payment method (or null).
export function validatePayment(
  raw: PaymentRaw,
  context: { today: string; parser: ReceiptParser | null },
): PaymentResult {
  const errors: Partial<Record<PaymentField, string>> = {};

  const methodId = z.string().uuid().safeParse(raw.paymentMethodId);
  if (!methodId.success) errors.paymentMethodId = "Please choose how you paid.";

  // The reference is cleaned again here, like on the phone: letters and digits only, no spaces.
  const referenceText = typeof raw.reference === "string" ? raw.reference : "";
  const reference = context.parser
    ? context.parser.normalizeReference(referenceText)
    : referenceText.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (reference.length < 6 || reference.length > 30) {
    errors.reference = "The reference number should be 6 to 30 letters or digits.";
  } else if (context.parser?.referencePattern && !context.parser.referencePattern.test(reference)) {
    errors.reference = `That does not look like a ${context.parser.displayName} reference number. Please check it.`;
  }

  // A minus sign means a negative number. parseAmount ignores symbols, so check it here.
  const amountCentavos =
    typeof raw.amount === "string" && !/^\s*[-−–]/.test(raw.amount)
      ? parseAmount(raw.amount)
      : null;
  if (amountCentavos === null)
    errors.amount = "Please enter the amount you paid, for example 1250.00.";
  else if (amountCentavos > MAX_AMOUNT_CENTAVOS)
    errors.amount = "That amount is too big. Please check it.";

  const paidOn = typeof raw.paidOn === "string" ? raw.paidOn : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || addDaysToIsoDate(paidOn, 0) !== paidOn) {
    errors.paidOn = "Please enter the date on your receipt.";
  } else if (paidOn > context.today) {
    errors.paidOn = "The date cannot be in the future.";
  } else if (paidOn < addDaysToIsoDate(context.today, -MAX_PAYMENT_AGE_DAYS)) {
    errors.paidOn = `The date is older than ${MAX_PAYMENT_AGE_DAYS} days. Please contact us.`;
  }

  if (raw.confirmed !== true)
    errors.confirmed = "Please tick the box to say the values match your receipt.";

  if (Object.keys(errors).length > 0 || !methodId.success || amountCentavos === null) {
    return { ok: false, errors };
  }

  const entry = z.enum(["ocr", "ocr_edited", "manual"]).catch("manual").parse(raw.entryMethod);
  const rawValues = ocrRawSchema.parse(raw.ocrRaw);
  return {
    ok: true,
    data: {
      paymentMethodId: methodId.data,
      reference,
      amountCentavos,
      paidOn,
      entryMethod: entry,
      ocrRawValues: entry === "manual" ? null : rawValues,
    },
  };
}
