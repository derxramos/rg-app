import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { todayInManila } from "@/lib/time";
import { validatePayment, type PaymentField, type PaymentRaw } from "@/lib/validation/payment";
import { getParser } from "@/ocr/parsers";
import { paymentMethods, payments, requests } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { changeStatus, isUniqueViolation } from "@/server/services/requests";

export const DUPLICATE_REFERENCE_MESSAGE =
  "This reference number was already used. Please check it.";

export type SavePaymentResult =
  | { ok: true; paymentId: string }
  | { ok: false; errors: Partial<Record<PaymentField | "form", string>> };

// Active payment methods, in the admin's order, with only what the client may see.
export async function listActivePaymentMethods(db: AppDb) {
  return db
    .select({
      id: paymentMethods.id,
      name: paymentMethods.name,
      parserKey: paymentMethods.parserKey,
      accountName: paymentMethods.accountName,
      accountNumber: paymentMethods.accountNumber,
      instructions: paymentMethods.instructions,
      qrImagePath: paymentMethods.qrImagePath,
    })
    .from(paymentMethods)
    .where(eq(paymentMethods.isActive, true))
    .orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.name));
}

export async function listPaymentsForRequest(db: AppDb, requestId: string) {
  return db
    .select({
      id: payments.id,
      methodSnapshot: payments.methodSnapshot,
      referenceNumber: payments.referenceNumber,
      amountCentavos: payments.amountCentavos,
      paidOn: payments.paidOn,
      status: payments.status,
      rejectionReason: payments.rejectionReason,
    })
    .from(payments)
    .where(eq(payments.requestId, requestId))
    .orderBy(desc(payments.createdAt));
}

// Server Action steps 3 to 6 in docs/OCR_PAYMENTS.md section 7. The CALLER has already checked access
// (requireRequestAccess "pay") and the rate limit.
export async function savePayment(
  db: AppDb,
  input: { requestId: string; raw: PaymentRaw; now?: Date },
): Promise<SavePaymentResult> {
  const now = input.now ?? new Date();

  const [method] = await db
    .select()
    .from(paymentMethods)
    .where(
      and(
        eq(paymentMethods.id, String(input.raw.paymentMethodId)),
        eq(paymentMethods.isActive, true),
      ),
    )
    .limit(1)
    .catch(() => []); // a value that is not a uuid cannot match
  const parser = getParser(method?.parserKey);

  const result = validatePayment(input.raw, { today: todayInManila(now), parser });
  if (!result.ok) return { ok: false, errors: result.errors };
  if (!method) return { ok: false, errors: { paymentMethodId: "Please choose how you paid." } };

  const [request] = await db
    .select({ status: requests.status })
    .from(requests)
    .where(eq(requests.id, input.requestId))
    .limit(1);
  if (!request) return { ok: false, errors: { form: "We could not find your request." } };

  try {
    const paymentId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(payments)
        .values({
          requestId: input.requestId,
          paymentMethodId: method.id,
          // Saved now, so we can see which account the client saw if the QR is ever swapped (T1).
          methodSnapshot: {
            name: method.name,
            accountName: method.accountName,
            accountNumber: method.accountNumber,
            qrImagePath: method.qrImagePath,
          },
          referenceNumber: result.data.reference,
          amountCentavos: result.data.amountCentavos,
          paidOn: result.data.paidOn,
          entryMethod: result.data.entryMethod,
          ocrRawValues: result.data.ocrRawValues,
        })
        .returning({ id: payments.id });
      return row.id;
    });

    // A Draft stays a Draft until the client sends the request (then it becomes "payment submitted").
    // A request that was already sent moves to "payment submitted" now.
    if (request.status !== "draft" && request.status !== "payment_submitted") {
      await changeStatus(db, {
        requestId: input.requestId,
        to: "payment_submitted",
        actor: "client",
        now,
      });
    }
    return { ok: true, paymentId };
  } catch (error) {
    if (isUniqueViolation(error))
      return { ok: false, errors: { reference: DUPLICATE_REFERENCE_MESSAGE } };
    throw error;
  }
}
