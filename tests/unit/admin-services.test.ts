import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requestDetailsSchema } from "@/lib/validation/request";
import { AdminAuthError, type AdminProfile } from "@/server/auth/admin-core";
import {
  activityLog,
  adminProfiles,
  paymentMethods,
  profiles,
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
  deletePaymentMethod,
  getServiceWithRequirements,
  moveService,
  movePaymentMethod,
  savePaymentMethod,
  saveSetting,
  setPaymentMethodActive,
  SettingsError,
} from "@/server/services/admin-settings";
import { inviteAdmin, updateAdmin, UserAdminError } from "@/server/services/admin-users";
import { csvCell, toCsv } from "@/server/services/csv";
import { savePayment } from "@/server/services/payments";
import { changeStatus, createDraft } from "@/server/services/requests";

import { createTestDb } from "../helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let owner: AdminProfile;
let owner2: AdminProfile;
let staff: AdminProfile;
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
  const rows = await t.db
    .insert(adminProfiles)
    .values([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        fullName: "Owner One",
        email: "zolb-test+o1@example.com",
        role: "owner",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        fullName: "Owner Two",
        email: "zolb-test+o2@example.com",
        role: "owner",
      },
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        fullName: "Staff One",
        email: "zolb-test+s@example.com",
        role: "staff",
      },
    ])
    .returning();
  [owner, owner2, staff] = rows;
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

describe("permissions: staff are refused on owner-only actions", () => {
  it("payment methods", async () => {
    expect(
      await rejects(savePaymentMethod(t.db, staff, pmInput({ id: methodId }), { fresh2fa: true })),
    ).toBe("wrong-role");
    expect(await rejects(setPaymentMethodActive(t.db, staff, methodId, false))).toBe("wrong-role");
    expect(await rejects(movePaymentMethod(t.db, staff, methodId, "up"))).toBe("wrong-role");
    expect(await rejects(deletePaymentMethod(t.db, staff, methodId, { fresh2fa: true }))).toBe(
      "wrong-role",
    );
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
  it("admin users, export and file settings", async () => {
    expect(
      await rejects(
        inviteAdmin(
          t.db,
          staff,
          { invite: async () => ({ id: "x" }) },
          { email: "zolb-test+n@example.com", fullName: "New", role: "staff" },
          { fresh2fa: true },
        ),
      ),
    ).toBe("wrong-role");
    expect(
      await rejects(
        updateAdmin(t.db, staff, { adminId: staff.id, isActive: false }, { fresh2fa: true }),
      ),
    ).toBe("wrong-role");
    expect(await rejects(exportCsv(t.db, staff, { type: "requests" }))).toBe("wrong-role");
    expect(await rejects(saveSetting(t.db, staff, "max_file_size_mb", 5))).toBe("wrong-role");
  });
  it("staff may change site content", async () => {
    await saveSetting(t.db, staff, "contact", {
      phone: "+63 900 000 0000",
      email: "",
      address: "",
    });
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
    expect(await rejects(deletePaymentMethod(t.db, owner, methodId, { fresh2fa: true }))).toBe(
      "in-use",
    );
    const created = await savePaymentMethod(
      t.db,
      owner,
      pmInput({ name: "Unused", accountName: "X Y", accountNumber: "111" }),
      { fresh2fa: true },
    );
    expect(await rejects(deletePaymentMethod(t.db, owner, created.id, { fresh2fa: false }))).toBe(
      "needs-fresh-2fa",
    );
    await deletePaymentMethod(t.db, owner, created.id, { fresh2fa: true });
    expect(
      await t.db.select().from(paymentMethods).where(eq(paymentMethods.id, created.id)),
    ).toHaveLength(0);
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
      (await listRequests(t.db, { includeDrafts: true })).rows.some((r) => r.status === "draft"),
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
      isActive: true,
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
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(SettingsError);
    await moveService(t.db, staff, a, "up");
    const order = (await t.db.select().from(services).orderBy(services.sortOrder)).map(
      (s) => s.slug,
    );
    expect(order[0]).toBe("brand-new-service");
  });
});

describe("admin users", () => {
  it("invites with a fresh code only, and logs it", async () => {
    const api = { invite: async () => ({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }) };
    const input = {
      email: "zolb-test+new@example.com",
      fullName: "New Staff",
      role: "staff" as const,
    };
    expect(await rejects(inviteAdmin(t.db, owner, api, input, { fresh2fa: false }))).toBe(
      "needs-fresh-2fa",
    );
    await inviteAdmin(t.db, owner, api, input, { fresh2fa: true });
    // The account role is "admin" too, because requireAdmin checks both records.
    const [account] = await t.db
      .select({ role: profiles.role })
      .from(profiles)
      .where(eq(profiles.id, "dddddddd-dddd-4ddd-8ddd-dddddddddddd"));
    expect(account.role).toBe("admin");
    expect(await rejects(inviteAdmin(t.db, owner, api, input, { fresh2fa: true }))).toBe("exists");
    expect(
      await rejects(inviteAdmin(t.db, owner, api, { ...input, email: "bad" }, { fresh2fa: true })),
    ).toBe("invalid");
  });
  it("blocks removing the last active owner, and self demotion", async () => {
    expect(
      await rejects(
        updateAdmin(t.db, owner, { adminId: owner.id, isActive: false }, { fresh2fa: true }),
      ),
    ).toBe("self");
    await updateAdmin(t.db, owner, { adminId: owner2.id, isActive: false }, { fresh2fa: true });
    // owner is now the only active owner. Another owner cannot be created here, so test via owner2 acting is blocked (inactive).
    const err = await updateAdmin(
      t.db,
      { ...owner2, role: "owner" } as AdminProfile,
      { adminId: owner.id, role: "staff" },
      { fresh2fa: true },
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UserAdminError);
    expect(err.code).toBe("last-owner");
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

void AdminAuthError;
