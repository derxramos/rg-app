import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDaysToIsoDate, todayInManila } from "@/lib/time";
import { requestDetailsSchema } from "@/lib/validation/request";
import { validatePayment } from "@/lib/validation/payment";
import { getParser } from "@/ocr/parsers";
import { paymentMethods, payments, requests, services } from "@/server/db/schema";
import {
  DUPLICATE_REFERENCE_MESSAGE,
  listActivePaymentMethods,
  savePayment,
} from "@/server/services/payments";
import { changeStatus, createDraft } from "@/server/services/requests";

import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-06T04:00:00Z"); // 12:00 in Manila
const TODAY = "2026-11-06";
const METHOD_ID = "11111111-1111-4111-8111-111111111111";

let t: Awaited<ReturnType<typeof createTestDb>>;

const raw = (o: Record<string, unknown> = {}) => ({
  paymentMethodId: METHOD_ID,
  reference: "1234 5678 9012",
  amount: "1,250.00",
  paidOn: "2026-11-05",
  confirmed: true,
  entryMethod: "manual",
  ocrRaw: null,
  ...o,
});

async function newRequest() {
  const d = await createDraft(
    t.db,
    requestDetailsSchema.parse({
      serviceSlug: "svc",
      fullName: "T",
      email: "zolb-test+p@example.com",
      phone: "9171234567",
      consent: true,
    }),
    { consentVersion: "v1", secret: "s" },
  );
  return d.requestId;
}

beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(services).values({ slug: "svc", name: "Service" });
  await t.db.insert(paymentMethods).values([
    {
      id: METHOD_ID,
      name: "GCash",
      accountName: "SAMPLE NAME",
      accountNumber: "0000",
      isActive: true,
      sortOrder: 1,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Off",
      accountName: "x",
      accountNumber: "1",
      isActive: false,
    },
  ]);
}, 60_000);
afterAll(async () => t.close());

describe("Manila date helpers", () => {
  it("finds today in Manila, even late in the evening UTC", () => {
    expect(todayInManila(new Date("2026-11-06T20:00:00Z"))).toBe("2026-11-07");
    expect(todayInManila(new Date("2026-11-06T01:00:00Z"))).toBe("2026-11-06");
  });
  it("adds days to a date", () => {
    expect(addDaysToIsoDate("2026-11-06", -60)).toBe("2026-09-07");
    expect(addDaysToIsoDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("validatePayment (docs/OCR_PAYMENTS.md section 7)", () => {
  const ctx = { today: TODAY, parser: getParser("gcash") };
  const check = (o: Record<string, unknown> = {}) => validatePayment(raw(o), ctx);

  it("accepts good values and cleans the reference", () => {
    const r = check();
    expect(r.ok && r.data).toMatchObject({
      reference: "123456789012",
      amountCentavos: 125000,
      paidOn: "2026-11-05",
    });
  });
  it("accepts today and exactly 60 days ago", () => {
    expect(check({ paidOn: "2026-11-06" }).ok).toBe(true);
    expect(check({ paidOn: "2026-09-07" }).ok).toBe(true);
  });
  it("refuses a future date, an older date, and a date that does not exist", () => {
    expect(check({ paidOn: "2026-11-07" })).toMatchObject({
      ok: false,
      errors: { paidOn: expect.stringMatching(/future/) },
    });
    expect(check({ paidOn: "2026-09-06" })).toMatchObject({
      ok: false,
      errors: { paidOn: expect.stringMatching(/older/) },
    });
    expect(check({ paidOn: "2026-02-30" }).ok).toBe(false);
    expect(check({ paidOn: "" }).ok).toBe(false);
  });
  it("refuses zero, negative, missing and too big amounts", () => {
    for (const amount of ["0", "-5", "", "abc", "100,000.01"])
      expect(check({ amount }).ok, amount).toBe(false);
    expect(check({ amount: "100000" }).ok).toBe(true);
  });
  it("refuses short and long references", () => {
    expect(check({ reference: "12345" }).ok).toBe(false);
    expect(check({ reference: "1".repeat(31) }).ok).toBe(false);
    expect(check({ reference: "!!!" }).ok).toBe(false);
  });
  it("uses the parser's reference pattern when it has one", () => {
    const strict = { ...getParser("gcash")!, referencePattern: /^\d{13}$/ };
    const r = validatePayment(raw(), { today: TODAY, parser: strict });
    expect(r).toMatchObject({ ok: false, errors: { reference: expect.stringMatching(/GCash/) } });
  });
  it("needs the confirm tick, and a real method id", () => {
    expect(check({ confirmed: false }).ok).toBe(false);
    expect(check({ confirmed: "true" }).ok).toBe(false);
    expect(check({ paymentMethodId: "nope" }).ok).toBe(false);
  });
  it("keeps the OCR raw values only for ocr entries, and cuts strange values", () => {
    const ocr = check({
      entryMethod: "ocr_edited",
      ocrRaw: { reference: "123", amount: "9", date: "x" },
    });
    expect(ocr.ok && ocr.data.ocrRawValues).toEqual({ reference: "123", amount: "9", date: "x" });
    const manual = check({ entryMethod: "manual", ocrRaw: { reference: "123" } });
    expect(manual.ok && manual.data.ocrRawValues).toBeNull();
    const huge = check({ entryMethod: "ocr", ocrRaw: { reference: "x".repeat(500) } });
    expect(huge.ok && huge.data.ocrRawValues).toBeNull();
    expect(
      check({ entryMethod: "hacked" }).ok &&
        (check({ entryMethod: "hacked" }) as { data: { entryMethod: string } }).data.entryMethod,
    ).toBe("manual");
  });
});

describe("savePayment", () => {
  it("saves the payment with a snapshot of the account the client saw", async () => {
    const requestId = await newRequest();
    const r = await savePayment(t.db, { requestId, raw: raw(), now: NOW });
    expect(r.ok).toBe(true);
    const [row] = await t.db.select().from(payments).where(eq(payments.requestId, requestId));
    expect(row.referenceNumber).toBe("123456789012");
    expect(row.amountCentavos).toBe(125000);
    expect(row.status).toBe("pending");
    expect(row.methodSnapshot).toMatchObject({
      name: "GCash",
      accountName: "SAMPLE NAME",
      accountNumber: "0000",
    });
  });

  it("keeps a Draft a Draft, but moves a sent request to payment submitted", async () => {
    const draftId = await newRequest();
    await savePayment(t.db, {
      requestId: draftId,
      raw: raw({ reference: "DRAFTREF001" }),
      now: NOW,
    });
    expect((await t.db.select().from(requests).where(eq(requests.id, draftId)))[0].status).toBe(
      "draft",
    );

    const sentId = await newRequest();
    await changeStatus(t.db, { requestId: sentId, to: "submitted", actor: "client" });
    await savePayment(t.db, {
      requestId: sentId,
      raw: raw({ reference: "SENTREF0001" }),
      now: NOW,
    });
    expect((await t.db.select().from(requests).where(eq(requests.id, sentId)))[0].status).toBe(
      "payment_submitted",
    );
  });

  it("refuses a reference number that was already used for the same method, with a clear message", async () => {
    const a = await newRequest();
    const b = await newRequest();
    await savePayment(t.db, { requestId: a, raw: raw({ reference: "DUPLICATE001" }), now: NOW });
    const again = await savePayment(t.db, {
      requestId: b,
      raw: raw({ reference: "duplicate 001" }),
      now: NOW,
    });
    expect(again).toEqual({ ok: false, errors: { reference: DUPLICATE_REFERENCE_MESSAGE } });
  });

  it("refuses an inactive or unknown payment method", async () => {
    const requestId = await newRequest();
    for (const id of [
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "not-a-uuid",
    ]) {
      const r = await savePayment(t.db, {
        requestId,
        raw: raw({ paymentMethodId: id, reference: "OTHERREF001" }),
        now: NOW,
      });
      expect(r.ok).toBe(false);
    }
  });

  it("saves nothing when a value is wrong", async () => {
    const requestId = await newRequest();
    const r = await savePayment(t.db, {
      requestId,
      raw: raw({ amount: "0", reference: "NOTHING0001" }),
      now: NOW,
    });
    expect(r.ok).toBe(false);
    expect(
      await t.db.select().from(payments).where(eq(payments.requestId, requestId)),
    ).toHaveLength(0);
  });

  it("lists only active methods", async () => {
    const methods = await listActivePaymentMethods(t.db);
    expect(methods.map((m) => m.name)).toEqual(["GCash"]);
  });
});
