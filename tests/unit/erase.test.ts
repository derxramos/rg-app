import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requestDetailsSchema } from "@/lib/validation/request";
import { AdminAuthError, type AdminProfile } from "@/server/auth/admin-core";
import { activityLog, adminProfiles, emailLog, paymentMethods, payments, requestFiles, requestNotes, requests, services } from "@/server/db/schema";
import { ERASED_NAME, addNote, eraseClientData } from "@/server/services/admin-requests";
import { changeStatus, createDraft } from "@/server/services/requests";
import { attemptTracking } from "@/server/services/tracking";
import type { StorageDriver } from "@/server/storage/types";

import { createTestDb } from "../helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let owner: AdminProfile;
let staff: AdminProfile;
const files = new Set<string>();
let failStorage = false;
const storage: StorageDriver = {
  put: async () => {},
  remove: async (_b, paths) => {
    if (failStorage) throw new Error("down");
    paths.forEach((p) => files.delete(p));
  },
  signedUrl: async () => "x",
};

async function setup() {
  const d = await createDraft(
    t.db,
    requestDetailsSchema.parse({ serviceSlug: "svc", fullName: "Real Person", email: "zolb-test+real@example.com", phone: "9171234567", businessName: "Real Biz", message: "My private message", consent: true }),
    { consentVersion: "v1", secret: "s" },
  );
  await changeStatus(t.db, { requestId: d.requestId, to: "submitted", actor: "client" });
  files.add(`requests/${d.requestId}/a.pdf`);
  await t.db.insert(requestFiles).values({ requestId: d.requestId, storagePath: `requests/${d.requestId}/a.pdf`, originalName: "passport.pdf", mimeType: "application/pdf", sizeBytes: 5 });
  await addNote(t.db, owner, { requestId: d.requestId, visibility: "internal", body: "Client phone is 0917 123 4567" });
  await t.db.insert(emailLog).values({ template: "request_submitted_client", toEmail: "zolb-test+real@example.com", requestId: d.requestId, status: "sent" });
  const [m] = await t.db.insert(paymentMethods).values({ name: "GCash", accountName: "x", accountNumber: "1" }).returning();
  await t.db.insert(payments).values({ requestId: d.requestId, paymentMethodId: m.id, methodSnapshot: {}, referenceNumber: `REF${Math.random().toString(36).slice(2, 9).toUpperCase()}`, amountCentavos: 5000, paidOn: "2026-11-05", entryMethod: "manual" });
  return { id: d.requestId, code: d.trackingCode };
}

beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(services).values({ slug: "svc", name: "Service" });
  [owner, staff] = await t.db.insert(adminProfiles).values([
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", fullName: "Owner", email: "zolb-test+o@example.com", role: "owner" },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", fullName: "Staff", email: "zolb-test+s@example.com", role: "staff" },
  ]).returning();
}, 60_000);
afterAll(async () => t.close());

describe("delete client data (privacy request)", () => {
  it("deletes the files and clears every personal field, and keeps the minimal record", async () => {
    const r = await setup();
    const result = await eraseClientData(t.db, storage, owner, { requestId: r.id, bucket: "b", fresh2fa: true });
    expect(result.filesDeleted).toBe(1);

    const [row] = await t.db.select().from(requests).where(eq(requests.id, r.id));
    expect(row).toMatchObject({ clientFullName: ERASED_NAME, clientEmail: "deleted@example.invalid", clientPhone: "+630000000000", businessName: null, clientMessage: null, publicMessage: null });
    // The minimal record stays: code, status, dates, and the payment values.
    expect(row.trackingCode).toBe(r.code);
    expect(row.submittedAt).not.toBeNull();
    expect((await t.db.select().from(payments).where(eq(payments.requestId, r.id)))[0].amountCentavos).toBe(5000);

    expect(files.has(`requests/${r.id}/a.pdf`)).toBe(false);
    const [file] = await t.db.select().from(requestFiles).where(eq(requestFiles.requestId, r.id));
    expect(file).toMatchObject({ originalName: "deleted" });
    expect(file.deletedAt).not.toBeNull();
    expect((await t.db.select().from(requestNotes).where(eq(requestNotes.requestId, r.id)))[0].body).toBe("[deleted]");
    expect((await t.db.select().from(emailLog).where(eq(emailLog.requestId, r.id)))[0].toEmail).toBe("deleted@example.invalid");
    // Nothing personal is left anywhere in the request's own rows.
    expect(JSON.stringify([row, file])).not.toMatch(/Real Person|zolb-test\+real|Real Biz|private message|passport/);
  });

  it("is logged, and the request can no longer be tracked", async () => {
    const r = await setup();
    await eraseClientData(t.db, storage, owner, { requestId: r.id, bucket: "b", fresh2fa: true });
    const log = await t.db.select().from(activityLog).where(eq(activityLog.entityId, r.id));
    expect(log.some((l) => l.action === "request.data_erased" && l.actorId === owner.id)).toBe(true);
    // The erased phone ends in 0000. Even that must not open it.
    expect(await attemptTracking(t.db, { code: r.code, last4: "0000" })).toEqual({ kind: "not-found" });
  });

  it("needs the owner and a fresh 2FA code", async () => {
    const r = await setup();
    const err = (p: Promise<unknown>) => p.catch((e) => (e as AdminAuthError).code);
    expect(await err(eraseClientData(t.db, storage, staff, { requestId: r.id, bucket: "b", fresh2fa: true }))).toBe("wrong-role");
    expect(await err(eraseClientData(t.db, storage, owner, { requestId: r.id, bucket: "b", fresh2fa: false }))).toBe("needs-fresh-2fa");
    expect((await t.db.select().from(requests).where(eq(requests.id, r.id)))[0].clientFullName).toBe("Real Person");
  });

  it("changes nothing when storage fails", async () => {
    const r = await setup();
    failStorage = true;
    await expect(eraseClientData(t.db, storage, owner, { requestId: r.id, bucket: "b", fresh2fa: true })).rejects.toThrow();
    failStorage = false;
    expect((await t.db.select().from(requests).where(eq(requests.id, r.id)))[0].clientFullName).toBe("Real Person");
    expect(files.has(`requests/${r.id}/a.pdf`)).toBe(true);
  });
});
