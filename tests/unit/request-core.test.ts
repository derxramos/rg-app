import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  generateTrackingCode,
  normalizeTrackingCode,
  TRACKING_CODE_PATTERN,
} from "@/lib/tracking-code";
import { requestDetailsSchema } from "@/lib/validation/request";
import {
  AccessError,
  checkRequestAccess,
  makeDraftCookieValue,
  makeTrackingSession,
  type RequestAction,
} from "@/server/auth/request-access-core";
import { activityLog, requestStatusEvents, requests, services } from "@/server/db/schema";
import { rateLimit } from "@/server/security/rate-limit";
import { cleanFileName, detectFileType } from "@/server/security/file-type";
import { hmacHex, safeEqual, signValue, verifySigned } from "@/server/security/tokens";
import { verifyTurnstile } from "@/server/security/turnstile";
import { changeStatus, createDraft, RequestError } from "@/server/services/requests";

import { createTestDb } from "../helpers/test-db";

const SECRET = "test-secret";
let t: Awaited<ReturnType<typeof createTestDb>>;
let serviceSlug: string;

const details = (overrides: Record<string, unknown> = {}) =>
  requestDetailsSchema.parse({
    serviceSlug,
    fullName: "Test Client",
    email: "zolb-test+client@example.com",
    phone: "0917 123 4567",
    consent: true,
    ...overrides,
  });

beforeAll(async () => {
  t = await createTestDb();
  const [s] = await t.db
    .insert(services)
    .values({ slug: "sample-service", name: "Sample service" })
    .returning();
  serviceSlug = s.slug;
}, 60_000);
afterAll(async () => t.close());

describe("tracking code", () => {
  it("has the format RG- plus 8 characters from the safe alphabet", () => {
    for (let i = 0; i < 200; i++) expect(generateTrackingCode()).toMatch(TRACKING_CODE_PATTERN);
  });
  it("never uses look-alike characters", () => {
    const many = Array.from({ length: 500 }, () => generateTrackingCode().slice(3)).join("");
    expect(many).not.toMatch(/[01OIL]/);
  });
  it("is different each time", () => {
    expect(new Set(Array.from({ length: 200 }, () => generateTrackingCode())).size).toBe(200);
  });
  it("cleans what a person types", () => {
    expect(normalizeTrackingCode("rg 7k3m-9qxd")).toBe("RG-7K3M9QXD");
    expect(normalizeTrackingCode("7k3m9qxd")).toBe("RG-7K3M9QXD");
  });
});

describe("file type check (magic bytes)", () => {
  it("accepts JPG, PNG and PDF by their first bytes", () => {
    expect(detectFileType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(
      detectFileType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext,
    ).toBe("png");
    expect(detectFileType(new TextEncoder().encode("%PDF-1.7 ..."))?.ext).toBe("pdf");
  });
  it("refuses a renamed program (exe) even if the name says .jpg", () => {
    expect(detectFileType(new TextEncoder().encode("MZ\x90\x00 this is an exe"))).toBeNull();
  });
  it("refuses empty and text files", () => {
    expect(detectFileType(new Uint8Array())).toBeNull();
    expect(detectFileType(new TextEncoder().encode("<html><script>"))).toBeNull();
  });
  it("cleans file names", () => {
    expect(cleanFileName("..\\..\\evil/../my file<>.pdf")).toBe("my file.pdf");
    expect(cleanFileName("")).toBe("file");
    expect(cleanFileName("a".repeat(300)).length).toBe(100);
  });
});

describe("tokens", () => {
  it("signs and verifies values", () => {
    const signed = signValue(SECRET, "abc.123");
    expect(verifySigned(SECRET, signed)).toBe("abc.123");
    expect(verifySigned("other-secret", signed)).toBeNull();
    expect(verifySigned(SECRET, signed.replace("abc", "abd"))).toBeNull();
    expect(verifySigned(SECRET, "nosignature")).toBeNull();
  });
  it("compares in constant time and handles different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit and then blocks, in one window", async () => {
    const now = new Date("2026-11-06T10:00:10Z");
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await rateLimit(t.db, { key: "t:one", limit: 3, windowSeconds: 3600, now }));
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].count).toBe(4);
    expect(results[3].retryAfterSeconds).toBeGreaterThan(0);
  });
  it("counts each key on its own, and starts again in the next window", async () => {
    const a = new Date("2026-11-06T10:00:10Z");
    const b = new Date("2026-11-06T11:00:10Z");
    expect(
      (await rateLimit(t.db, { key: "t:two", limit: 1, windowSeconds: 3600, now: a })).allowed,
    ).toBe(true);
    expect(
      (await rateLimit(t.db, { key: "t:two", limit: 1, windowSeconds: 3600, now: a })).allowed,
    ).toBe(false);
    expect(
      (await rateLimit(t.db, { key: "t:three", limit: 1, windowSeconds: 3600, now: a })).allowed,
    ).toBe(true);
    expect(
      (await rateLimit(t.db, { key: "t:two", limit: 1, windowSeconds: 3600, now: b })).allowed,
    ).toBe(true);
  });
});

describe("Turnstile check", () => {
  const ok = vi.fn(async () => new Response(JSON.stringify({ success: true })));
  const bad = vi.fn(async () => new Response(JSON.stringify({ success: false })));

  it("accepts a token that Cloudflare confirms, and sends the secret and the token", async () => {
    expect(await verifyTurnstile({ token: "tok", secret: "s", fetchImpl: ok as never })).toBe(true);
    const body = (ok.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(body.get("secret")).toBe("s");
    expect(body.get("response")).toBe("tok");
  });
  it("refuses a token Cloudflare rejects, a missing token, and a failed call", async () => {
    expect(await verifyTurnstile({ token: "tok", secret: "s", fetchImpl: bad as never })).toBe(
      false,
    );
    expect(await verifyTurnstile({ token: "", secret: "s", fetchImpl: ok as never })).toBe(false);
    const broken = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await verifyTurnstile({ token: "tok", secret: "s", fetchImpl: broken as never })).toBe(
      false,
    );
  });
  it("refuses everything in production when the secret is missing, but allows it in development", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await verifyTurnstile({ token: "x", secret: "", production: true })).toBe(false);
    expect(await verifyTurnstile({ token: "x", secret: "", production: false })).toBe(true);
  });
});

describe("request details validation", () => {
  it("accepts good details and normalizes the phone", () => {
    expect(details().phone).toBe("+639171234567");
  });
  it("does not accept a missing consent tick", () => {
    expect(() => details({ consent: false })).toThrow();
    expect(() => details({ consent: undefined })).toThrow();
  });
  it("rejects a bad email, phone, and a too long message", () => {
    expect(() => details({ email: "nope" })).toThrow();
    expect(() => details({ phone: "123" })).toThrow();
    expect(() => details({ message: "x".repeat(2001) })).toThrow();
  });
});

describe("createDraft", () => {
  it("saves a Draft with a hashed token, a 7 day expiry and a first timeline row", async () => {
    const now = new Date("2026-11-06T00:00:00Z");
    const result = await createDraft(t.db, details(), {
      consentVersion: "v1",
      secret: SECRET,
      now,
    });
    expect(result.trackingCode).toMatch(TRACKING_CODE_PATTERN);

    const [row] = await t.db.select().from(requests).where(eq(requests.id, result.requestId));
    expect(row.status).toBe("draft");
    expect(row.clientPhone).toBe("+639171234567");
    expect(row.clientPhoneLast4).toBe("4567");
    expect(row.consentVersion).toBe("v1");
    // Only the hash is stored, never the token.
    expect(row.draftTokenHash).toBe(hmacHex(SECRET, result.token));
    expect(row.draftTokenHash).not.toContain(result.token);
    expect(row.draftExpiresAt?.toISOString()).toBe("2026-11-13T00:00:00.000Z");

    const events = await t.db
      .select()
      .from(requestStatusEvents)
      .where(eq(requestStatusEvents.requestId, row.id));
    expect(events).toHaveLength(1);
    expect(events[0].toStatus).toBe("draft");
  });

  it("refuses an unknown or inactive service", async () => {
    await expect(
      createDraft(t.db, details({ serviceSlug: "nope" }), { consentVersion: "v1", secret: SECRET }),
    ).rejects.toMatchObject({ code: "service-not-found" });
    await t.db.update(services).set({ isActive: false }).where(eq(services.slug, serviceSlug));
    await expect(
      createDraft(t.db, details(), { consentVersion: "v1", secret: SECRET }),
    ).rejects.toBeInstanceOf(RequestError);
    await t.db.update(services).set({ isActive: true }).where(eq(services.slug, serviceSlug));
  });

  it("tries again with a new code when a tracking code is already used", async () => {
    const first = await createDraft(t.db, details(), { consentVersion: "v1", secret: SECRET });
    const codes = [first.trackingCode, first.trackingCode, "RG-AAAAAAA2"];
    const second = await createDraft(t.db, details(), {
      consentVersion: "v1",
      secret: SECRET,
      makeCode: () => codes.shift() as string,
    });
    expect(second.trackingCode).toBe("RG-AAAAAAA2");
  });

  it("gives up after 5 clashes", async () => {
    const first = await createDraft(t.db, details(), { consentVersion: "v1", secret: SECRET });
    await expect(
      createDraft(t.db, details(), {
        consentVersion: "v1",
        secret: SECRET,
        makeCode: () => first.trackingCode,
      }),
    ).rejects.toMatchObject({ code: "code-collision" });
  });
});

describe("changeStatus", () => {
  async function newDraft() {
    return createDraft(t.db, details(), { consentVersion: "v1", secret: SECRET });
  }

  it("submits a draft: sets submitted_at, clears the draft token, writes the timeline", async () => {
    const draft = await newDraft();
    await changeStatus(t.db, { requestId: draft.requestId, to: "submitted", actor: "client" });
    const [row] = await t.db.select().from(requests).where(eq(requests.id, draft.requestId));
    expect(row.status).toBe("submitted");
    expect(row.submittedAt).not.toBeNull();
    expect(row.draftTokenHash).toBeNull();
    const events = await t.db
      .select()
      .from(requestStatusEvents)
      .where(eq(requestStatusEvents.requestId, row.id));
    expect(events.map((e) => e.toStatus)).toEqual(["draft", "submitted"]);
  });

  it("refuses changes the rules do not allow", async () => {
    const draft = await newDraft();
    await expect(
      changeStatus(t.db, { requestId: draft.requestId, to: "completed", actor: "client" }),
    ).rejects.toMatchObject({ code: "status-not-allowed" });
    await expect(
      changeStatus(t.db, { requestId: draft.requestId, to: "submitted", actor: "admin" }),
    ).rejects.toMatchObject({ code: "status-not-allowed" });
    const [row] = await t.db.select().from(requests).where(eq(requests.id, draft.requestId));
    expect(row.status).toBe("draft");
  });

  it("refuses an unknown request", async () => {
    await expect(
      changeStatus(t.db, {
        requestId: "00000000-0000-4000-8000-000000000000",
        to: "submitted",
        actor: "client",
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("logs admin changes in activity_log with who and what, and sets completed_at", async () => {
    const draft = await newDraft();
    await changeStatus(t.db, { requestId: draft.requestId, to: "submitted", actor: "client" });
    await changeStatus(t.db, {
      requestId: draft.requestId,
      to: "under_review",
      actor: "admin",
      adminId: null,
    });
    await changeStatus(t.db, {
      requestId: draft.requestId,
      to: "in_progress",
      actor: "admin",
      adminId: null,
    });
    await changeStatus(t.db, {
      requestId: draft.requestId,
      to: "completed",
      actor: "admin",
      adminId: null,
    });
    const [row] = await t.db.select().from(requests).where(eq(requests.id, draft.requestId));
    expect(row.completedAt).not.toBeNull();
    const log = await t.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.entityId, draft.requestId));
    expect(log.map((l) => l.action)).toEqual(Array(3).fill("request.status_changed"));
  });

  it("clears completed_at when a completed request is opened again", async () => {
    const draft = await newDraft();
    for (const to of ["submitted", "under_review", "in_progress", "completed"] as const) {
      await changeStatus(t.db, {
        requestId: draft.requestId,
        to,
        actor: to === "submitted" ? "client" : "admin",
      });
    }
    await changeStatus(t.db, { requestId: draft.requestId, to: "in_progress", actor: "admin" });
    const [row] = await t.db.select().from(requests).where(eq(requests.id, draft.requestId));
    expect(row.completedAt).toBeNull();
  });
});

describe("requireRequestAccess (core)", () => {
  async function setup() {
    const draft = await createDraft(t.db, details(), { consentVersion: "v1", secret: SECRET });
    return { ...draft, cookie: makeDraftCookieValue(draft.requestId, draft.token) };
  }
  const check = (input: {
    requestId: string;
    action: RequestAction;
    draftCookie?: string | null;
    trackingCookie?: string | null;
    now?: Date;
  }) => checkRequestAccess(t.db, { secret: SECRET, ...input });

  it("lets the owner of the draft cookie work on a draft", async () => {
    const d = await setup();
    for (const action of ["view", "upload", "removeFile", "pay", "submit"] as const) {
      const access = await check({ requestId: d.requestId, action, draftCookie: d.cookie });
      expect(access.via).toBe("draft");
    }
  });

  it("refuses when there is no cookie", async () => {
    const d = await setup();
    await expect(check({ requestId: d.requestId, action: "upload" })).rejects.toMatchObject({
      code: "no-cookie",
    });
  });

  it("refuses a wrong token (another browser)", async () => {
    const d = await setup();
    await expect(
      check({
        requestId: d.requestId,
        action: "upload",
        draftCookie: makeDraftCookieValue(d.requestId, "x".repeat(43)),
      }),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("refuses a cookie of another request (cannot upload to someone else's request)", async () => {
    const mine = await setup();
    const other = await setup();
    // Using my cookie on the other request: the request id in the cookie does not match.
    await expect(
      check({ requestId: other.requestId, action: "upload", draftCookie: mine.cookie }),
    ).rejects.toBeInstanceOf(AccessError);
    // Even with my token pasted into the other request's id:
    await expect(
      check({
        requestId: other.requestId,
        action: "upload",
        draftCookie: makeDraftCookieValue(other.requestId, mine.token),
      }),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("refuses an expired draft", async () => {
    const d = await setup();
    const later = new Date(d.draftExpiresAt.getTime() + 1000);
    await expect(
      check({ requestId: d.requestId, action: "upload", draftCookie: d.cookie, now: later }),
    ).rejects.toMatchObject({ code: "expired" });
  });

  it("stops the draft cookie after the request is submitted", async () => {
    const d = await setup();
    await changeStatus(t.db, { requestId: d.requestId, to: "submitted", actor: "client" });
    await expect(
      check({ requestId: d.requestId, action: "upload", draftCookie: d.cookie }),
    ).rejects.toBeInstanceOf(AccessError);
  });

  it("answers the same for an id that does not exist", async () => {
    await expect(
      check({
        requestId: "00000000-0000-4000-8000-000000000000",
        action: "view",
        draftCookie: "a:b",
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  describe("tracking session", () => {
    async function submitted(status: "submitted" | "waiting_for_client") {
      const d = await setup();
      await changeStatus(t.db, { requestId: d.requestId, to: "submitted", actor: "client" });
      if (status === "waiting_for_client") {
        await changeStatus(t.db, {
          requestId: d.requestId,
          to: "waiting_for_client",
          actor: "admin",
        });
      }
      const session = makeTrackingSession(SECRET, d.requestId, Date.now() + 60 * 60 * 1000);
      return { d, session };
    }

    it("can view and pay a submitted request, but cannot upload or remove files", async () => {
      const { d, session } = await submitted("submitted");
      expect(
        (await check({ requestId: d.requestId, action: "view", trackingCookie: session })).via,
      ).toBe("tracking");
      await check({ requestId: d.requestId, action: "pay", trackingCookie: session });
      await expect(
        check({ requestId: d.requestId, action: "upload", trackingCookie: session }),
      ).rejects.toMatchObject({ code: "wrong-status" });
      await expect(
        check({ requestId: d.requestId, action: "removeFile", trackingCookie: session }),
      ).rejects.toMatchObject({ code: "wrong-status" });
      await expect(
        check({ requestId: d.requestId, action: "submit", trackingCookie: session }),
      ).rejects.toMatchObject({ code: "wrong-status" });
    });

    it("can upload more files only when the status is Waiting for client", async () => {
      const { d, session } = await submitted("waiting_for_client");
      await check({ requestId: d.requestId, action: "upload", trackingCookie: session });
    });

    it("refuses an expired, forged or wrong-request session", async () => {
      const { d } = await submitted("submitted");
      const expired = makeTrackingSession(SECRET, d.requestId, Date.now() - 1000);
      await expect(
        check({ requestId: d.requestId, action: "view", trackingCookie: expired }),
      ).rejects.toMatchObject({ code: "expired" });

      const forged = makeTrackingSession("wrong-secret", d.requestId, Date.now() + 100000);
      await expect(
        check({ requestId: d.requestId, action: "view", trackingCookie: forged }),
      ).rejects.toMatchObject({ code: "invalid" });

      const other = await submitted("submitted");
      await expect(
        check({ requestId: d.requestId, action: "view", trackingCookie: other.session }),
      ).rejects.toMatchObject({ code: "invalid" });
    });
  });
});
