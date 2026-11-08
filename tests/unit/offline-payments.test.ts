import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { stepHref } from "@/components/shared/stepper";
import { requestDetailsSchema } from "@/lib/validation/request";
import type { PanelUser } from "@/server/auth/panel-core";
import { activityLog, payments, requests, services } from "@/server/db/schema";
import {
  OfflinePaymentError,
  recordOfflinePayment,
  voidOfflinePayment,
} from "@/server/services/admin-requests";
import { changeStatus, createDraft, updateDraftDetails } from "@/server/services/requests";

import { insertPanelUsers } from "../helpers/panel-users";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-06T04:00:00Z"); // 12:00 in Manila
let t: Awaited<ReturnType<typeof createTestDb>>;
let owner: PanelUser;
let admin: PanelUser;
let staff: PanelUser;
let user: PanelUser;

async function newRequest(sent: boolean) {
  const d = await createDraft(
    t.db,
    requestDetailsSchema.parse({
      serviceSlug: "svc",
      fullName: "T",
      email: "zolb-test+off@example.com",
      phone: "9171234567",
      consent: true,
    }),
    { consentVersion: "v1", secret: "s" },
  );
  if (sent) await changeStatus(t.db, { requestId: d.requestId, to: "submitted", actor: "client" });
  return d.requestId;
}

const good = (requestId: string, over: Record<string, string> = {}) => ({
  requestId,
  method: "cash",
  amount: "1500",
  paidOn: "2026-11-05",
  receiptNumber: "OR-0001",
  ...over,
});

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (error) {
    return error instanceof OfflinePaymentError ? error.code : String((error as Error).message);
  }
}

beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(services).values({ slug: "svc", name: "Service" });
  [owner, admin, staff] = (await insertPanelUsers(t.db, [
    {
      id: "a0000000-0000-4000-8000-0000000000a1",
      fullName: "Owner",
      email: "zolb-test+o@example.com",
      role: "owner",
    },
    {
      id: "b0000000-0000-4000-8000-0000000000b1",
      fullName: "Admin",
      email: "zolb-test+a@example.com",
      role: "admin",
    },
    {
      id: "c0000000-0000-4000-8000-0000000000c1",
      fullName: "Staff",
      email: "zolb-test+s@example.com",
      role: "staff",
    },
  ])) as [PanelUser, PanelUser, PanelUser];
  user = { ...staff, role: "user" } as unknown as PanelUser;
}, 60_000);
afterAll(async () => t.close());

describe("recordOfflinePayment", () => {
  it("lets staff record cash: the payment is verified, the request is marked paid, the log names the person", async () => {
    const id = await newRequest(true);
    const result = await recordOfflinePayment(t.db, staff, good(id), NOW);
    expect(result).toMatchObject({ amountCentavos: 150000, method: "cash", byStaff: true });

    const [pay] = await t.db.select().from(payments).where(eq(payments.requestId, id));
    expect(pay).toMatchObject({
      status: "verified",
      entryMethod: "offline",
      offlineMethod: "cash",
      paymentMethodId: null,
      recordedBy: staff.id,
      referenceNumber: "OR0001",
    });
    const [req] = await t.db.select().from(requests).where(eq(requests.id, id));
    expect(req.status).toBe("payment_verified");

    const logs = await t.db.select().from(activityLog).where(eq(activityLog.entityId, pay.id));
    expect(logs.map((l) => l.action)).toContain("payment.recorded_offline");
    expect(logs.find((l) => l.action === "payment.recorded_offline")?.actorId).toBe(staff.id);
  });

  it("works for admin and owner too, and builds a reference when only a note is given", async () => {
    const id = await newRequest(true);
    const r = await recordOfflinePayment(
      t.db,
      owner,
      good(id, { receiptNumber: "", note: "Paid at the desk", method: "bank_transfer" }),
      NOW,
    );
    expect(r.byStaff).toBe(false);
    const [pay] = await t.db.select().from(payments).where(eq(payments.requestId, id));
    expect(pay.referenceNumber).toMatch(/^OFF[A-Z0-9]{8}$/);
    expect(pay.note).toBe("Paid at the desk");
    expect(await codeOf(recordOfflinePayment(t.db, admin, good(await newRequest(true)), NOW))).toBe(
      "ok",
    );
  });

  it("refuses a client account", async () => {
    const id = await newRequest(true);
    expect(await codeOf(recordOfflinePayment(t.db, user, good(id), NOW))).not.toBe("ok");
    expect(await t.db.select().from(payments).where(eq(payments.requestId, id))).toHaveLength(0);
  });

  it("checks the values", async () => {
    const id = await newRequest(true);
    const bad = (over: Record<string, string>) =>
      codeOf(recordOfflinePayment(t.db, staff, good(id, over), NOW));
    expect(await bad({ method: "gcash" })).toBe("invalid");
    expect(await bad({ amount: "0" })).toBe("invalid");
    expect(await bad({ amount: "abc" })).toBe("invalid");
    expect(await bad({ paidOn: "2026-11-07" })).toBe("invalid"); // tomorrow in Manila
    expect(await bad({ paidOn: "yesterday" })).toBe("invalid");
    expect(await bad({ receiptNumber: "" })).toBe("invalid"); // no receipt and no note
    expect(await bad({ method: "other" })).toBe("invalid"); // "other" needs a note
    expect(await bad({ method: "other", receiptNumber: "", note: "Paid by a relative" })).toBe(
      "ok",
    );
  });

  it("refuses a draft and an unknown request", async () => {
    const draft = await newRequest(false);
    expect(await codeOf(recordOfflinePayment(t.db, staff, good(draft), NOW))).toBe("wrong-status");
    expect(
      await codeOf(
        recordOfflinePayment(t.db, staff, good("00000000-0000-4000-8000-000000000000"), NOW),
      ),
    ).toBe("not-found");
  });
});

describe("voidOfflinePayment", () => {
  async function recorded() {
    const id = await newRequest(true);
    const r = await recordOfflinePayment(t.db, staff, good(id), NOW);
    return r.paymentId;
  }

  it("lets admin and owner void it, with a reason, and logs it", async () => {
    const paymentId = await recorded();
    await voidOfflinePayment(t.db, admin, { paymentId, reason: "Typed the wrong amount" });
    const [pay] = await t.db.select().from(payments).where(eq(payments.id, paymentId));
    expect(pay.status).toBe("rejected");
    expect(pay.rejectionReason).toContain("Typed the wrong amount");
    const logs = await t.db.select().from(activityLog).where(eq(activityLog.entityId, paymentId));
    expect(logs.map((l) => l.action)).toContain("payment.voided");
  });

  it("refuses staff, a missing reason, and a second void", async () => {
    const paymentId = await recorded();
    expect(
      await codeOf(voidOfflinePayment(t.db, staff, { paymentId, reason: "Mistake" })),
    ).not.toBe("ok");
    expect(await codeOf(voidOfflinePayment(t.db, owner, { paymentId, reason: " " }))).toBe(
      "invalid",
    );
    expect(await codeOf(voidOfflinePayment(t.db, owner, { paymentId, reason: "Mistake" }))).toBe(
      "ok",
    );
    expect(await codeOf(voidOfflinePayment(t.db, owner, { paymentId, reason: "Mistake" }))).toBe(
      "wrong-status",
    );
  });
});

describe("database rules for offline payments", () => {
  it("does not allow a payment with no method unless it is offline", async () => {
    const id = await newRequest(true);
    const insert = (over: Record<string, unknown>) =>
      t.db.insert(payments).values({
        requestId: id,
        paymentMethodId: null,
        methodSnapshot: {},
        referenceNumber: `REF${Math.random().toString(36).slice(2, 10)}`,
        amountCentavos: 100,
        paidOn: "2026-11-05",
        entryMethod: "manual",
        ...over,
      });
    await expect(insert({})).rejects.toThrow();
    await expect(insert({ entryMethod: "offline", offlineMethod: "cheque" })).rejects.toThrow();
    await expect(insert({ entryMethod: "offline", offlineMethod: "cash" })).resolves.toBeDefined();
  });
});

describe("updateDraftDetails", () => {
  it("changes name, phone, business and message of a draft", async () => {
    const id = await newRequest(false);
    await updateDraftDetails(t.db, id, {
      fullName: "New Name",
      phone: "+639181112222",
      businessName: "Shop",
      message: "Hello",
    });
    const [req] = await t.db.select().from(requests).where(eq(requests.id, id));
    expect(req).toMatchObject({
      clientFullName: "New Name",
      clientPhone: "+639181112222",
      clientPhoneLast4: "2222",
      businessName: "Shop",
      clientMessage: "Hello",
    });
  });

  it("refuses a request that was already sent", async () => {
    const id = await newRequest(true);
    await expect(
      updateDraftDetails(t.db, id, {
        fullName: "X",
        phone: "+639181112222",
        businessName: "",
        message: "",
      }),
    ).rejects.toMatchObject({ code: "not-draft" });
  });
});

describe("stepHref", () => {
  it("links each earlier step, and never the last one", () => {
    expect(stepHref("abc", 1)).toBe("/request/abc/details");
    expect(stepHref("abc", 2)).toBe("/request/abc/documents");
    expect(stepHref("abc", 3)).toBe("/request/abc/payment");
    expect(stepHref("abc", 4)).toBe("/request/abc/payment");
    expect(stepHref("abc", 5)).toBeNull();
  });
});
