import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requestDetailsSchema } from "@/lib/validation/request";
import { PanelAuthError, type PanelUser } from "@/server/auth/panel-core";
import { setActor } from "@/server/db/actor";
import {
  activityLog,
  paymentMethods,
  payments,
  requestFiles,
  requests,
  services,
} from "@/server/db/schema";
import {
  addNote,
  getFileLink,
  getRequestDetail,
  listRequests,
  rejectPayment,
  verifyPayment,
  PaymentActionFailure,
  adminChangeStatus,
} from "@/server/services/admin-requests";
import { exportCsv, getDashboard, listActivity } from "@/server/services/admin-overview";
import {
  addRequirement,
  createService,
  deletePaymentMethods,
  deleteRequirement,
  getServiceWithRequirements,
  moveService,
  movePaymentMethod,
  savePaymentMethod,
  saveSetting,
  setPaymentMethodActive,
  SettingsError,
  updateService,
} from "@/server/services/admin-settings";
import { csvCell, toCsv } from "@/server/services/csv";
import { savePayment } from "@/server/services/payments";
import { changeStatus, createDraft } from "@/server/services/requests";

import { insertPanelUsers } from "../helpers/panel-users";
import { createTestDb } from "../helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let owner: PanelUser;
let admin: PanelUser;
let staff: PanelUser;
let methodId: string;

const pmInput = (o: Record<string, unknown> = {}) => ({
  name: "GCash",
  parserKey: "gcash",
  accountName: "SAMPLE NAME",
  accountNumber: "0000",
  instructions: "",
  isActive: true,
  ...o,
});

async function sentRequest(email = "zolb-test+r@example.com", name = "Test Client") {
  const d = await createDraft(
    t.db,
    requestDetailsSchema.parse({
      serviceSlug: "svc",
      fullName: name,
      email,
      phone: "9171234567",
      consent: true,
    }),
    { consentVersion: "v1", secret: "s" },
  );
  await changeStatus(t.db, { requestId: d.requestId, to: "submitted", actor: "client" });
  return d.requestId;
}

const rejects = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e) => (e as { code?: string }).code ?? (e as Error).message,
  );

beforeAll(async () => {
  t = await createTestDb();
  const rows = await insertPanelUsers(t.db, [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      fullName: "Owner One",
      email: "zolb-test+o1@example.com",
      role: "owner",
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      fullName: "Admin One",
      email: "zolb-test+a1@example.com",
      role: "admin",
    },
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      fullName: "Staff One",
      email: "zolb-test+s@example.com",
      role: "staff",
    },
  ]);
  [owner, admin, staff] = rows;
  await t.db.insert(services).values({ slug: "svc", name: "Service" });
  [{ id: methodId }] = await t.db
    .insert(paymentMethods)
    .values({
      name: "GCash",
      parserKey: "gcash",
      accountName: "SAMPLE NAME",
      accountNumber: "0000",
      isActive: true,
    })
    .returning();
}, 60_000);
afterAll(async () => t.close());

describe("permissions: staff are refused on admin and owner actions", () => {
  it("payment methods", async () => {
    expect(
      await rejects(savePaymentMethod(t.db, staff, pmInput({ id: methodId }), { fresh2fa: true })),
    ).toBe("wrong-role");
    expect(await rejects(setPaymentMethodActive(t.db, staff, methodId, false))).toBe("wrong-role");
    expect(await rejects(movePaymentMethod(t.db, staff, methodId, "up"))).toBe("wrong-role");
    expect(
      await rejects(deletePaymentMethods(t.db, staff, { ids: [methodId] }, { fresh2fa: true })),
    ).toBe("wrong-role");
  });
  it("verifying and rejecting payments (owner decision)", async () => {
    const requestId = await sentRequest("zolb-test+vs@example.com");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
    const r = await savePayment(t.db, {
      requestId,
      raw: {
        paymentMethodId: methodId,
        reference: "STAFFREF001",
        amount: "10",
        paidOn: today,
        confirmed: true,
        entryMethod: "manual",
        ocrRaw: null,
      },
    });
    if (!r.ok) throw new Error("setup failed");
    expect(
      await rejects(verifyPayment(t.db, staff, { paymentId: r.paymentId, foundInAccount: true })),
    ).toBe("wrong-role");
    expect(
      await rejects(rejectPayment(t.db, staff, { paymentId: r.paymentId, reason: "No match" })),
    ).toBe("wrong-role");
    expect((await t.db.select().from(payments).where(eq(payments.id, r.paymentId)))[0].status).toBe(
      "pending",
    );
  });
  it("export, file settings and site content", async () => {
    expect(await rejects(exportCsv(t.db, staff, { type: "requests" }))).toBe("wrong-role");
    expect(await rejects(saveSetting(t.db, staff, "max_file_size_mb", 5))).toBe("wrong-role");
    expect(
      await rejects(
        saveSetting(t.db, staff, "contact", { phone: "+63 900 000 0000", email: "", address: "" }),
      ),
    ).toBe("wrong-role");
  });
  it("an admin has the same power as the owner here", async () => {
    await saveSetting(t.db, admin, "contact", {
      phone: "+63 900 000 0000",
      email: "",
      address: "",
    });
  });
  it("services: staff may change words only (no fee, no hide, no payment links, no delete, no reorder)", async () => {
    const id = await createService(t.db, owner, {
      name: "Staff Rules Service",
      shortDescription: "",
      description: "",
      isActive: true,
      feeCentavos: 100000,
    });
    const keep = {
      name: "Staff Rules Service",
      shortDescription: "new words",
      description: "",
    };
    // Same fee and visibility (left out) = fine.
    await updateService(t.db, staff, id, keep);
    expect(await rejects(updateService(t.db, staff, id, { ...keep, feeCentavos: 5 }))).toBe(
      "wrong-role",
    );
    expect(await rejects(updateService(t.db, staff, id, { ...keep, isActive: false }))).toBe(
      "wrong-role",
    );
    expect(await rejects(updateService(t.db, staff, id, { ...keep, paymentMethodIds: [] }))).toBe(
      "wrong-role",
    );
    expect(await rejects(moveService(t.db, staff, id, "up"))).toBe("wrong-role");
    await addRequirement(t.db, staff, id, { label: "Item", details: "", isRequired: true });
    const [item] = (await getServiceWithRequirements(t.db, id))!.requirements;
    expect(await rejects(deleteRequirement(t.db, staff, item.id))).toBe("wrong-role");
    await deleteRequirement(t.db, admin, item.id);
    const [after] = await t.db.select().from(services).where(eq(services.id, id));
    expect(after.feeCentavos).toBe(100000);
    expect(after.isActive).toBe(true);
  });
  it("services: staff can add a service, but it starts hidden and with no fee", async () => {
    expect(
      await rejects(
        createService(t.db, staff, {
          name: "Visible By Staff",
          shortDescription: "",
          description: "",
          isActive: true,
        }),
      ),
    ).toBe("wrong-role");
    expect(
      await rejects(
        createService(t.db, staff, {
          name: "Fee By Staff",
          shortDescription: "",
          description: "",
          feeCentavos: 500,
        }),
      ),
    ).toBe("wrong-role");
    const id = await createService(t.db, staff, {
      name: "Hidden By Staff",
      shortDescription: "",
      description: "",
    });
    const [row] = await t.db.select().from(services).where(eq(services.id, id));
    expect(row.isActive).toBe(false);
    expect(row.feeCentavos).toBeNull();
  });
  it("the database itself refuses a staff fee change or payment verify (second layer)", async () => {
    // Even if the code forgot the check, the trigger knows who is acting (app.actor_id).
    const [svc] = await t.db.select().from(services).limit(1);
    const attempt = t.db.transaction(async (tx) => {
      await setActor(tx, staff.id);
      await tx.update(services).set({ feeCentavos: 1 }).where(eq(services.id, svc.id));
    });
    await expect(attempt).rejects.toThrow();
  });
});

describe("payment methods (owner, fresh 2FA, logging)", () => {
  it("needs a fresh 2FA code to change the QR, the account name or number, or to add a method", async () => {
    expect(
      await rejects(
        savePaymentMethod(t.db, owner, pmInput({ id: methodId, accountNumber: "9999" }), {
          fresh2fa: false,
        }),
      ),
    ).toBe("needs-fresh-2fa");
    expect(
      await rejects(
        savePaymentMethod(t.db, owner, pmInput({ id: methodId, accountName: "OTHER" }), {
          fresh2fa: false,
        }),
      ),
    ).toBe("needs-fresh-2fa");
    expect(
      await rejects(
        savePaymentMethod(t.db, owner, pmInput({ id: methodId, newQrImagePath: "qr/new.png" }), {
          fresh2fa: false,
        }),
      ),
    ).toBe("needs-fresh-2fa");
    expect(
      await rejects(
        savePaymentMethod(t.db, owner, pmInput({ name: "New one" }), { fresh2fa: false }),
      ),
    ).toBe("needs-fresh-2fa");
    const [row] = await t.db.select().from(paymentMethods).where(eq(paymentMethods.id, methodId));
    expect(row.accountNumber).toBe("0000");
  });
  it("lets the owner change harmless fields without a code", async () => {
    const r = await savePaymentMethod(
      t.db,
      owner,
      pmInput({ id: methodId, instructions: "Pay now" }),
      { fresh2fa: false },
    );
    expect(r.risky).toBe(false);
  });
  it("saves a QR change with a fresh code and writes who, before and after (twice: app and trigger)", async () => {
    const r = await savePaymentMethod(
      t.db,
      owner,
      pmInput({ id: methodId, newQrImagePath: "qr/new.png" }),
      { fresh2fa: true },
    );
    expect(r.risky).toBe(true);
    const logs = await t.db.select().from(activityLog).where(eq(activityLog.entityId, methodId));
    const app = logs.find((l) => l.action === "payment_method.qr_changed")!;
    expect(app.actorId).toBe(owner.id);
    expect(app.details).toMatchObject({ after: { qrImagePath: "qr/new.png" } });
    // The database trigger records the whole row, with the admin id the app set.
    const trigger = logs.filter((l) => l.action === "payment_method.row_changed").at(-1)!;
    expect(trigger.actorId).toBe(owner.id);
    expect(trigger.actorType).toBe("admin");
  });
  it("cannot delete a method that payments used, but can delete an unused one", async () => {
    const requestId = await sentRequest("zolb-test+d@example.com");
    await savePayment(t.db, {
      requestId,
      raw: {
        paymentMethodId: methodId,
        reference: "DELETEREF01",
        amount: "10",
        paidOn: new Date().toISOString().slice(0, 10),
        confirmed: true,
        entryMethod: "manual",
        ocrRaw: null,
      },
    });
    const kept = await deletePaymentMethods(t.db, owner, { ids: [methodId] }, { fresh2fa: true });
    expect(kept.deleted).toHaveLength(0);
    expect(kept.skipped.map((s) => s.reason)).toEqual(["has-payments"]);
    const created = await savePaymentMethod(
      t.db,
      owner,
      pmInput({ name: "Unused", accountName: "X Y", accountNumber: "111" }),
      { fresh2fa: true },
    );
    expect(
      await rejects(deletePaymentMethods(t.db, owner, { ids: [created.id] }, { fresh2fa: false })),
    ).toBe("needs-fresh-2fa");
    await deletePaymentMethods(t.db, owner, { ids: [created.id] }, { fresh2fa: true });
    expect(
      await t.db.select().from(paymentMethods).where(eq(paymentMethods.id, created.id)),
    ).toHaveLength(0);
  });
  it("deletes several methods at once from the list, and keeps the ones that payments used", async () => {
    const make = (name: string) =>
      savePaymentMethod(t.db, owner, pmInput({ name, accountName: "X Y", accountNumber: "222" }), {
        fresh2fa: true,
      });
    const a = await make("Bulk A");
    const b = await make("Bulk B");
    const ids = [a.id, b.id, methodId];

    // Staff are refused, and a fresh 2FA code is needed (admin and owner both).
    expect(await rejects(deletePaymentMethods(t.db, staff, { ids }, { fresh2fa: true }))).toBe(
      "wrong-role",
    );
    expect(await rejects(deletePaymentMethods(t.db, admin, { ids }, { fresh2fa: false }))).toBe(
      "needs-fresh-2fa",
    );
    // Nothing to delete, a made-up id, or too many ids.
    expect(await rejects(deletePaymentMethods(t.db, owner, { ids: [] }, { fresh2fa: true }))).toBe(
      "invalid",
    );
    expect(
      await rejects(deletePaymentMethods(t.db, owner, { ids: ["not-an-id"] }, { fresh2fa: true })),
    ).toBe("invalid");
    expect(
      await rejects(
        deletePaymentMethods(
          t.db,
          owner,
          {
            ids: Array.from(
              { length: 101 },
              (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
            ),
          },
          { fresh2fa: true },
        ),
      ),
    ).toBe("invalid");
    // Nothing was deleted by the refused tries.
    expect(
      await t.db.select().from(paymentMethods).where(eq(paymentMethods.id, a.id)),
    ).toHaveLength(1);

    // An admin deletes three at once: the two unused go, the one that payments used stays and is named.
    const result = await deletePaymentMethods(
      t.db,
      admin,
      { ids: [...ids, a.id] },
      { fresh2fa: true },
    );
    expect(result.deleted.map((m) => m.name).sort()).toEqual(["Bulk A", "Bulk B"]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ id: methodId, reason: "has-payments" });
    expect(result.skipped[0].payments).toBeGreaterThanOrEqual(1);
    expect(
      await t.db.select().from(paymentMethods).where(eq(paymentMethods.id, a.id)),
    ).toHaveLength(0);
    expect(
      await t.db.select().from(paymentMethods).where(eq(paymentMethods.id, methodId)),
    ).toHaveLength(1);

    // Each deleted method is in the activity log with the admin and the "bulk" mark. The database trigger
    // also wrote the row it removed.
    const logs = await t.db.select().from(activityLog).where(eq(activityLog.entityId, a.id));
    const app = logs.find((l) => l.action === "payment_method.deleted")!;
    expect(app.actorId).toBe(admin.id);
    expect(app.details).toMatchObject({ name: "Bulk A", bulk: true });
    const trigger = logs.find(
      (l) =>
        l.action === "payment_method.row_changed" &&
        (l.details as { operation?: string }).operation === "DELETE",
    )!;
    expect(trigger.actorId).toBe(admin.id);

    // Ids that no longer exist are reported, not an error.
    const again = await deletePaymentMethods(t.db, owner, { ids: [a.id] }, { fresh2fa: true });
    expect(again.deleted).toHaveLength(0);
    expect(again.skipped).toMatchObject([{ id: a.id, reason: "not-found" }]);
  });
});

describe("verify and reject payments", () => {
  async function pendingPayment(ref: string) {
    const requestId = await sentRequest(`zolb-test+${ref}@example.com`);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
    const r = await savePayment(t.db, {
      requestId,
      raw: {
        paymentMethodId: methodId,
        reference: ref,
        amount: "250",
        paidOn: today,
        confirmed: true,
        entryMethod: "ocr",
        ocrRaw: { reference: ref },
      },
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return { requestId, paymentId: r.paymentId };
  }

  it("needs the tick 'I found this payment in our account'", async () => {
    const { paymentId } = await pendingPayment("VERIFYREF01");
    expect(await rejects(verifyPayment(t.db, owner, { paymentId, foundInAccount: false }))).toBe(
      "confirm-needed",
    );
    const [p] = await t.db.select().from(payments).where(eq(payments.id, paymentId));
    expect(p.status).toBe("pending");
  });
  it("verifies, logs, and moves the request to payment verified", async () => {
    const { requestId, paymentId } = await pendingPayment("VERIFYREF02");
    await verifyPayment(t.db, owner, { paymentId, foundInAccount: true });
    const [p] = await t.db.select().from(payments).where(eq(payments.id, paymentId));
    expect(p).toMatchObject({ status: "verified", verifiedBy: owner.id });
    expect((await t.db.select().from(requests).where(eq(requests.id, requestId)))[0].status).toBe(
      "payment_verified",
    );
    const log = await t.db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.entityId, paymentId), eq(activityLog.action, "payment.verified")));
    expect(log).toHaveLength(1);
    expect(await rejects(verifyPayment(t.db, owner, { paymentId, foundInAccount: true }))).toBe(
      "not-pending",
    );
  });
  it("rejects with a reason, tells the client, and asks them for more", async () => {
    const { requestId, paymentId } = await pendingPayment("REJECTREF01");
    expect(await rejects(rejectPayment(t.db, owner, { paymentId, reason: " " }))).toBe(
      "reason-needed",
    );
    await rejectPayment(t.db, owner, { paymentId, reason: "We could not find this reference." });
    const [row] = await t.db.select().from(requests).where(eq(requests.id, requestId));
    expect(row.status).toBe("waiting_for_client");
    expect(row.publicMessage).toContain("We could not find this reference.");
    expect((await t.db.select().from(payments).where(eq(payments.id, paymentId)))[0]).toMatchObject(
      { status: "rejected" },
    );
  });
  it("knows a payment that does not exist", async () => {
    const err = await verifyPayment(t.db, owner, {
      paymentId: "00000000-0000-4000-8000-000000000000",
      foundInAccount: true,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentActionFailure);
  });
});

describe("requests: list, filters, notes, status, file links", () => {
  it("hides drafts by default, and filters by status, search and date", async () => {
    await createDraft(
      t.db,
      requestDetailsSchema.parse({
        serviceSlug: "svc",
        fullName: "Draft Person",
        email: "zolb-test+draft@example.com",
        phone: "9171234567",
        consent: true,
      }),
      { consentVersion: "v1", secret: "s" },
    );
    await sentRequest("zolb-test+find@example.com", "Findable Person");
    const all = await listRequests(t.db);
    expect(all.rows.every((r) => r.status !== "draft")).toBe(true);
    expect(
      (await listRequests(t.db, { status: "draft" })).rows.some((r) => r.status === "draft"),
    ).toBe(true);
    expect((await listRequests(t.db, { q: "findable" })).rows.map((r) => r.clientFullName)).toEqual(
      ["Findable Person"],
    );
    expect(
      (await listRequests(t.db, { status: "submitted" })).rows.every(
        (r) => r.status === "submitted",
      ),
    ).toBe(true);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
    expect((await listRequests(t.db, { from: today, to: today })).total).toBeGreaterThan(0);
    expect((await listRequests(t.db, { to: "2020-01-01" })).total).toBe(0);
  });
  it("treats % and _ in a search as plain characters", async () => {
    expect((await listRequests(t.db, { q: "%" })).total).toBe(0);
    expect((await listRequests(t.db, { q: "_____" })).total).toBe(0);
  });
  it("shows the payment state in the list", async () => {
    const withPayment = (await listRequests(t.db)).rows.filter(
      (r) => r.paymentState !== "not_paid",
    );
    expect(withPayment.length).toBeGreaterThan(0);
  });
  it("adds internal and client notes. Only a client note becomes the public message", async () => {
    const id = await sentRequest("zolb-test+n@example.com");
    await addNote(t.db, staff, { requestId: id, visibility: "internal", body: "Call the client" });
    expect(
      (await t.db.select().from(requests).where(eq(requests.id, id)))[0].publicMessage,
    ).toBeNull();
    await addNote(t.db, staff, {
      requestId: id,
      visibility: "client",
      body: "Please send your ID.",
    });
    expect((await t.db.select().from(requests).where(eq(requests.id, id)))[0].publicMessage).toBe(
      "Please send your ID.",
    );
    const detail = await getRequestDetail(t.db, id);
    expect(detail?.notes.map((n) => n.visibility).sort()).toEqual(["client", "internal"]);
    await expect(
      addNote(t.db, staff, { requestId: id, visibility: "client", body: "  " }),
    ).rejects.toBeTruthy();
  });
  it("changes status with a message to the client, only to allowed statuses", async () => {
    const id = await sentRequest("zolb-test+st@example.com");
    await adminChangeStatus(t.db, staff, {
      requestId: id,
      to: "waiting_for_client",
      message: "We need one more paper.",
    });
    expect((await t.db.select().from(requests).where(eq(requests.id, id)))[0]).toMatchObject({
      status: "waiting_for_client",
      publicMessage: "We need one more paper.",
    });
    expect(await rejects(adminChangeStatus(t.db, staff, { requestId: id, to: "completed" }))).toBe(
      "status-not-allowed",
    );
  });
  it("makes a 60 second link, and logs every file open", async () => {
    const id = await sentRequest("zolb-test+f@example.com");
    const [file] = await t.db
      .insert(requestFiles)
      .values({
        requestId: id,
        storagePath: "requests/x/a.pdf",
        originalName: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
      })
      .returning();
    const asked: number[] = [];
    const storage = {
      put: async () => {},
      remove: async () => {},
      signedUrl: async (_b: string, _p: string, s: number) => (asked.push(s), "signed://x"),
    };
    expect(await getFileLink(t.db, storage, staff, { fileId: file.id, bucket: "b" })).toBe(
      "signed://x",
    );
    expect(asked).toEqual([60]);
    const log = await t.db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.entityId, file.id), eq(activityLog.action, "file.opened")));
    expect(log).toHaveLength(1);
    // A file that cleanup removed has no link.
    await t.db
      .update(requestFiles)
      .set({ deletedAt: new Date() })
      .where(eq(requestFiles.id, file.id));
    expect(await getFileLink(t.db, storage, staff, { fileId: file.id, bucket: "b" })).toBeNull();
  });
});

describe("services and checklists", () => {
  it("creates a service with an EMPTY checklist, adds items, and reorders services", async () => {
    const a = await createService(t.db, staff, {
      name: "Brand New Service",
      shortDescription: "",
      description: "",
    });
    expect((await getServiceWithRequirements(t.db, a))?.requirements).toHaveLength(0);
    await addRequirement(t.db, staff, a, { label: "Requirement 1", details: "", isRequired: true });
    expect((await getServiceWithRequirements(t.db, a))?.requirements.map((r) => r.label)).toEqual([
      "Requirement 1",
    ]);
    await expect(
      createService(t.db, staff, {
        name: "Brand New Service",
        shortDescription: "",
        description: "",
      }),
    ).rejects.toBeInstanceOf(SettingsError);
    const slugs = async () =>
      (await t.db.select().from(services).orderBy(services.sortOrder)).map((s) => s.slug);
    const before = (await slugs()).indexOf("brand-new-service");
    await moveService(t.db, owner, a, "up");
    expect((await slugs()).indexOf("brand-new-service")).toBe(before - 1);
  });
});

describe("settings, dashboard, activity and export", () => {
  it("validates settings and logs before and after", async () => {
    await saveSetting(t.db, owner, "max_file_size_mb", 4);
    await expect(saveSetting(t.db, owner, "max_file_size_mb", 99)).rejects.toBeTruthy();
    await expect(saveSetting(t.db, owner, "last_cleanup_at" as never, null)).rejects.toBeInstanceOf(
      SettingsError,
    );
    const log = await t.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.entityId, "max_file_size_mb"));
    expect(log[0].details).toMatchObject({ after: 4 });
  });
  it("shows the dashboard numbers and job warnings", async () => {
    const d = await getDashboard(t.db);
    expect(d.byStatus.submitted).toBeGreaterThan(0);
    expect(d.storage.tone).toBe("default");
    expect(d.jobs.cleanupStale).toBe(true);
    expect(d.lastMethodChange?.name).toBeTruthy();
    expect(d.needsAction.length).toBeGreaterThan(0);
  });
  it("lists the activity log with filters", async () => {
    expect(
      (await listActivity(t.db, { action: "payment" })).rows.every((r) =>
        r.action.startsWith("payment"),
      ),
    ).toBe(true);
    expect((await listActivity(t.db, { actorId: owner.id })).total).toBeGreaterThan(0);
  });
  it("exports CSV for the owner, escapes formulas, and logs the export", async () => {
    await sentRequest("zolb-test+csv@example.com", '=HYPERLINK("http://evil")');
    const csv = await exportCsv(t.db, owner, { type: "requests" });
    expect(csv).toContain("'=HYPERLINK");
    expect(csv.startsWith("﻿")).toBe(true);
    expect((await exportCsv(t.db, owner, { type: "payments" })).split("\r\n")[0]).toContain(
      "Amount (PHP)",
    );
    const log = await t.db.select().from(activityLog).where(eq(activityLog.action, "export.csv"));
    expect(log).toHaveLength(2);
  });
  it("treats storage over the warning percent as warning, and over 95 percent as danger", async () => {
    const id = await sentRequest("zolb-test+big@example.com");
    const [big] = await t.db
      .insert(requestFiles)
      .values({
        requestId: id,
        storagePath: "requests/big/a.pdf",
        originalName: "big.pdf",
        mimeType: "application/pdf",
        sizeBytes: 900_000_000,
      })
      .returning();
    expect((await getDashboard(t.db)).storage.tone).toBe("warning");
    await t.db
      .update(requestFiles)
      .set({ sizeBytes: 1_050_000_000 })
      .where(eq(requestFiles.id, big.id));
    expect((await getDashboard(t.db)).storage.tone).toBe("danger");
  });
});

describe("csv", () => {
  it("escapes formulas, quotes and new lines", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(new Date("2026-11-06T00:00:00Z"))).toBe("2026-11-06T00:00:00.000Z");
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("﻿a,b\r\n1,x\r\n");
  });
});

void PanelAuthError;
