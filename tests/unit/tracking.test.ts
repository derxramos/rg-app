import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requestDetailsSchema } from "@/lib/validation/request";
import { payments, paymentMethods, requestFiles, requests, services } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import {
  LOCK_MINUTES,
  MAX_WRONG_TRIES,
  TRACK_NOT_FOUND,
  attemptTracking,
  getTrackingView,
} from "@/server/services/tracking";
import { changeStatus, createDraft } from "@/server/services/requests";
import { addNote } from "@/server/services/admin-requests";

import { insertPanelUsers } from "../helpers/panel-users";
import { createTestDb } from "../helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
const T0 = new Date("2026-11-06T04:00:00Z");
const min = (m: number) => new Date(T0.getTime() + m * 60_000);

async function sentRequest(phone = "9171234567", name = "Secret Name") {
  const d = await createDraft(
    t.db,
    requestDetailsSchema.parse({
      serviceSlug: "svc",
      fullName: name,
      email: "zolb-test+secret@example.com",
      phone,
      consent: true,
    }),
    { consentVersion: "v1", secret: "s" },
  );
  await changeStatus(t.db, { requestId: d.requestId, to: "submitted", actor: "client" });
  return { id: d.requestId, code: d.trackingCode };
}

beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(services).values({ slug: "svc", name: "Service" });
}, 60_000);
afterAll(async () => t.close());

describe("attemptTracking", () => {
  it("accepts the right code and last 4 digits (any case, spaces)", async () => {
    const r = await sentRequest();
    expect(await attemptTracking(t.db, { code: r.code, last4: "4567", now: T0 })).toEqual({
      kind: "ok",
      requestId: r.id,
    });
    expect(
      (await attemptTracking(t.db, { code: ` ${r.code.toLowerCase()} `, last4: "4567", now: T0 }))
        .kind,
    ).toBe("ok");
  });

  it("says nothing different for a wrong code and for wrong digits", async () => {
    const r = await sentRequest();
    const wrongDigits = await attemptTracking(t.db, { code: r.code, last4: "0000", now: T0 });
    const wrongCode = await attemptTracking(t.db, { code: "RG-ZZZZZZZZ", last4: "4567", now: T0 });
    const badFormat = await attemptTracking(t.db, { code: "hello", last4: "12", now: T0 });
    expect(wrongDigits).toEqual({ kind: "not-found" });
    expect(wrongCode).toEqual(wrongDigits);
    expect(badFormat).toEqual(wrongDigits);
    expect(TRACK_NOT_FOUND).not.toMatch(/code is wrong|digits are wrong/i);
  });

  it("does not track a draft", async () => {
    const d = await createDraft(
      t.db,
      requestDetailsSchema.parse({
        serviceSlug: "svc",
        fullName: "D",
        email: "zolb-test+d@example.com",
        phone: "9170000000",
        consent: true,
      }),
      { consentVersion: "v1", secret: "s" },
    );
    expect(await attemptTracking(t.db, { code: d.trackingCode, last4: "0000", now: T0 })).toEqual({
      kind: "not-found",
    });
  });

  it("after 5 wrong tries the code is locked, and the 6th is refused EVEN with the right digits", async () => {
    const r = await sentRequest();
    for (let i = 0; i < MAX_WRONG_TRIES; i++) {
      expect((await attemptTracking(t.db, { code: r.code, last4: "1111", now: min(i) })).kind).toBe(
        "not-found",
      );
    }
    const sixth = await attemptTracking(t.db, { code: r.code, last4: "4567", now: min(5) });
    expect(sixth.kind).toBe("locked");
    if (sixth.kind === "locked") expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("the lock ends exactly 15 minutes after the 5th wrong try", async () => {
    const r = await sentRequest();
    for (let i = 0; i < 5; i++)
      await attemptTracking(t.db, { code: r.code, last4: "1111", now: min(i) });
    // The 5th wrong try was at minute 4. The lock holds until minute 19.
    expect(
      (await attemptTracking(t.db, { code: r.code, last4: "4567", now: min(4 + LOCK_MINUTES - 1) }))
        .kind,
    ).toBe("locked");
    expect(
      (await attemptTracking(t.db, { code: r.code, last4: "4567", now: min(4 + LOCK_MINUTES + 1) }))
        .kind,
    ).toBe("ok");
  });

  it("a code that does not exist locks the same way, so existence cannot be learned", async () => {
    const code = "RG-ABCDEFGH";
    for (let i = 0; i < 5; i++) await attemptTracking(t.db, { code, last4: "1111", now: min(i) });
    expect((await attemptTracking(t.db, { code, last4: "1111", now: min(6) })).kind).toBe("locked");
  });

  it("wrong tries older than 15 minutes do not count, and a right answer clears them", async () => {
    const r = await sentRequest();
    for (let i = 0; i < 4; i++)
      await attemptTracking(t.db, { code: r.code, last4: "1111", now: min(i) });
    expect((await attemptTracking(t.db, { code: r.code, last4: "1111", now: min(30) })).kind).toBe(
      "not-found",
    );
    for (let i = 0; i < 3; i++)
      await attemptTracking(t.db, { code: r.code, last4: "1111", now: min(31 + i) });
    expect((await attemptTracking(t.db, { code: r.code, last4: "4567", now: min(35) })).kind).toBe(
      "ok",
    );
    // After the right answer the counter starts again.
    for (let i = 0; i < 4; i++)
      expect(
        (await attemptTracking(t.db, { code: r.code, last4: "1111", now: min(36 + i) })).kind,
      ).toBe("not-found");
  });
});

describe("getTrackingView: the minimal view", () => {
  it("shows only service, status, timeline, the admin message and a payment summary", async () => {
    const r = await sentRequest("9179998888", "Very Private Person");
    const [admin] = await insertPanelUsers(t.db, [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        fullName: "Staff",
        email: "zolb-test+s@example.com",
        role: "staff",
      },
    ]);
    await addNote(t.db, admin, { requestId: r.id, visibility: "internal", body: "INTERNAL ONLY" });
    await addNote(t.db, admin, {
      requestId: r.id,
      visibility: "client",
      body: "Please send your ID.",
    });
    await t.db.insert(requestFiles).values({
      requestId: r.id,
      storagePath: "requests/x/secret-document.pdf",
      originalName: "my-secret-passport.pdf",
      mimeType: "application/pdf",
      sizeBytes: 5,
    });
    const [method] = await t.db
      .insert(paymentMethods)
      .values({ name: "GCash", accountName: "ACCT NAME", accountNumber: "ACCT-NUMBER-123" })
      .returning();
    await t.db.insert(payments).values({
      requestId: r.id,
      paymentMethodId: method.id,
      methodSnapshot: { accountNumber: "ACCT-NUMBER-123" },
      referenceNumber: "REFSECRET001",
      amountCentavos: 99900,
      paidOn: "2026-11-05",
      entryMethod: "manual",
    });

    const view = await getTrackingView(t.db, r.id);
    expect(view).toMatchObject({
      serviceName: "Service",
      status: "submitted",
      statusLabel: "Submitted",
      message: "Please send your ID.",
      payment: "pending",
      canPay: true,
      canUploadMore: false,
    });
    expect(view!.timeline.map((e) => e.status)).toEqual(["submitted"]);

    // Nothing private is anywhere in the object.
    const all = JSON.stringify(view);
    for (const secret of [
      "my-secret-passport",
      "secret-document",
      "zolb-test+secret",
      "9179998888",
      "8888",
      "Very Private",
      "ACCT-NUMBER",
      "REFSECRET",
      "99900",
      "INTERNAL ONLY",
    ]) {
      expect(all, secret).not.toContain(secret);
    }
    expect(Object.keys(view!).sort()).toEqual([
      "canPay",
      "canUploadMore",
      "message",
      "payment",
      "serviceName",
      "status",
      "statusLabel",
      "timeline",
    ]);
  });

  it("allows paying and uploading only in the right statuses", async () => {
    const r = await sentRequest();
    expect(await getTrackingView(t.db, r.id)).toMatchObject({ canPay: true, canUploadMore: false });
    await changeStatus(t.db, { requestId: r.id, to: "waiting_for_client", actor: "admin" });
    expect(await getTrackingView(t.db, r.id)).toMatchObject({ canPay: true, canUploadMore: true });
    await changeStatus(t.db, { requestId: r.id, to: "under_review", actor: "admin" });
    await changeStatus(t.db, { requestId: r.id, to: "in_progress", actor: "admin" });
    expect(await getTrackingView(t.db, r.id)).toMatchObject({
      canPay: false,
      canUploadMore: false,
    });
  });

  it("returns null for an unknown request", async () => {
    expect(await getTrackingView(t.db, "00000000-0000-4000-8000-000000000000")).toBeNull();
    void eq;
    void requests;
  });
});
