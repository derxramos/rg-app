// The "owner" way into a request: a signed-in user who owns it (requests.user_id). Plus createDraft with a user,
// and the storage path for the owner's files. Test accounts use zolb-test+...@example.com only.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requestDetailsSchema } from "@/lib/validation/request";
import {
  AccessError,
  checkRequestAccess,
  makeTrackingSession,
} from "@/server/auth/request-access-core";
import { profiles, requests, services } from "@/server/db/schema";
import { buildStoragePath } from "@/server/services/files";
import { changeStatus, createDraft } from "@/server/services/requests";

import { createTestDb } from "../helpers/test-db";

const SECRET = "test-secret";
const A = "a0000000-0000-4000-8000-00000000000a";
const B = "b0000000-0000-4000-8000-00000000000b";

let t: Awaited<ReturnType<typeof createTestDb>>;
let serviceSlug: string;
let requestA: string;

const details = () =>
  requestDetailsSchema.parse({
    serviceSlug,
    fullName: "Test Client",
    email: "zolb-test+client@example.com",
    phone: "0917 123 4567",
    consent: true,
  });

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e) => (e instanceof AccessError ? e.code : String(e)),
  );

beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(profiles).values([
    { id: A, email: "zolb-test+a@example.com" },
    { id: B, email: "zolb-test+b@example.com" },
  ]);
  const [s] = await t.db.insert(services).values({ slug: "svc", name: "Sample" }).returning();
  serviceSlug = s.slug;
  const created = await createDraft(t.db, details(), {
    consentVersion: "v1",
    secret: SECRET,
    userId: A,
  });
  requestA = created.requestId;
}, 60_000);
afterAll(async () => t.close());

const input = (
  action: Parameters<typeof checkRequestAccess>[1]["action"],
  userId: string | null,
) => ({
  requestId: requestA,
  action,
  userId,
  secret: SECRET,
});

describe("createDraft with a user", () => {
  it("saves the owner id", async () => {
    const [row] = await t.db.select().from(requests).where(eq(requests.id, requestA));
    expect(row.userId).toBe(A);
  });
});

describe("owner access", () => {
  it("lets the owner view and use a draft", async () => {
    for (const action of ["view", "upload", "removeFile", "pay", "submit"] as const) {
      expect(await codeOf(checkRequestAccess(t.db, input(action, A))), action).toBe("ok");
    }
    expect((await checkRequestAccess(t.db, input("view", A))).via).toBe("owner");
  });

  it("refuses another signed-in user, with the same answer as a missing request", async () => {
    expect(await codeOf(checkRequestAccess(t.db, input("view", B)))).toBe("no-cookie");
    const missing = { ...input("view", B), requestId: "99999999-9999-4999-8999-999999999999" };
    expect(await codeOf(checkRequestAccess(t.db, missing))).toBe("not-found");
  });

  it("refuses a visitor who is not signed in", async () => {
    expect(await codeOf(checkRequestAccess(t.db, input("view", null)))).toBe("no-cookie");
  });

  it("follows the status rules for the owner", async () => {
    await changeStatus(t.db, { requestId: requestA, to: "submitted", actor: "client" });
    // After sending: view yes, upload no, remove no, submit no, pay yes.
    expect(await codeOf(checkRequestAccess(t.db, input("view", A)))).toBe("ok");
    expect(await codeOf(checkRequestAccess(t.db, input("upload", A)))).toBe("wrong-status");
    expect(await codeOf(checkRequestAccess(t.db, input("removeFile", A)))).toBe("wrong-status");
    expect(await codeOf(checkRequestAccess(t.db, input("submit", A)))).toBe("wrong-status");
    expect(await codeOf(checkRequestAccess(t.db, input("pay", A)))).toBe("ok");

    await changeStatus(t.db, { requestId: requestA, to: "under_review", actor: "admin" });
    await changeStatus(t.db, { requestId: requestA, to: "waiting_for_client", actor: "admin" });
    expect(await codeOf(checkRequestAccess(t.db, input("upload", A)))).toBe("ok");
  });

  it("does not stop the tracking-code way (code + last 4 digits) for the same request", async () => {
    const session = makeTrackingSession(SECRET, requestA, Date.now() + 60_000);
    const result = await checkRequestAccess(t.db, {
      ...input("view", null),
      trackingCookie: session,
    });
    expect(result.via).toBe("tracking");
  });

  it("refuses an owner whose draft ran out of time", async () => {
    const created = await createDraft(t.db, details(), {
      consentVersion: "v1",
      secret: SECRET,
      userId: B,
      now: new Date("2026-01-01T00:00:00Z"),
    });
    const old = {
      requestId: created.requestId,
      action: "upload" as const,
      userId: B,
      secret: SECRET,
    };
    expect(await codeOf(checkRequestAccess(t.db, old))).toBe("expired");
  });
});

describe("storage path", () => {
  it("puts a user's files under users/{userId}/requests/{requestId}/", () => {
    const path = buildStoragePath({ userId: A, requestId: requestA, ext: "jpg" });
    expect(path).toMatch(new RegExp(`^users/${A}/requests/${requestA}/[0-9a-f-]{36}\\.jpg$`));
  });
  it("keeps the old requests/{requestId}/ path for old guest requests", () => {
    const path = buildStoragePath({ userId: null, requestId: requestA, ext: "pdf" });
    expect(path).toMatch(new RegExp(`^requests/${requestA}/[0-9a-f-]{36}\\.pdf$`));
  });
  it("never uses the original file name or anything the browser sends", () => {
    const path = buildStoragePath({ userId: A, requestId: requestA, ext: "png" });
    expect(path).not.toMatch(/\.\.|\s/);
  });
});
