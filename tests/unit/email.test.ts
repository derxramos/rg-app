import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { requestDetailsSchema } from "@/lib/validation/request";
import { sendWithBrevo } from "@/server/email/brevo";
import {
  DAILY_EMAIL_LIMIT,
  RETRYABLE,
  deliver,
  emailsSentToday,
  listEmailsForRequest,
  retryEmail,
  sendRequestEmail,
  type EmailContext,
} from "@/server/email/send";
import * as templates from "@/server/email/templates";
import { emailLog, requests, services } from "@/server/db/schema";
import { changeStatus, createDraft } from "@/server/services/requests";

import { createTestDb } from "../helpers/test-db";

const ok = () =>
  vi.fn(async () => new Response(JSON.stringify({ messageId: "<abc@brevo>" }), { status: 201 }));
const config = { apiKey: "SECRET-KEY-123", fromAddress: "from@example.com", fromName: "RG" };
const message = {
  to: { email: "zolb-test+to@example.com", name: "To" },
  subject: "Hi",
  html: "<p>Hi</p>",
  text: "Hi",
};

describe("Brevo sender", () => {
  it("posts to the v3 API with the key in a header, and returns the message id", async () => {
    const f = ok();
    const r = await sendWithBrevo(
      { ...message, replyTo: { email: "reply@example.com" } },
      config,
      f as never,
    );
    expect(r).toEqual({ ok: true, messageId: "<abc@brevo>" });
    const [url, init] = f.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers["api-key"]).toBe("SECRET-KEY-123");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      sender: { email: "from@example.com" },
      to: [{ email: "zolb-test+to@example.com" }],
      subject: "Hi",
      replyTo: { email: "reply@example.com" },
    });
    // The key is only in the header, never in the body.
    expect(init.body).not.toContain("SECRET-KEY-123");
  });
  it("never throws, and never puts the key in an error", async () => {
    const bad = vi.fn(async () => new Response("nope", { status: 401 }));
    const r1 = await sendWithBrevo(message, config, bad as never);
    expect(r1).toEqual({ ok: false, error: "Brevo answered 401." });
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed for key SECRET-KEY-123");
    });
    const r2 = await sendWithBrevo(message, config, down as never);
    expect(r2.ok).toBe(false);
    expect(JSON.stringify(r2)).not.toContain("SECRET-KEY-123");
  });
  it("says clearly when email is not set up", async () => {
    expect(await sendWithBrevo(message, { ...config, apiKey: undefined })).toMatchObject({
      ok: false,
      error: expect.stringContaining("BREVO_API_KEY"),
    });
    expect(await sendWithBrevo(message, { ...config, fromAddress: "" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("EMAIL_FROM_ADDRESS"),
    });
  });
});

describe("templates", () => {
  it("escape everything a client typed", () => {
    const evil = `<script>alert(1)</script> "quoted" & <a href="http://evil">x</a>`;
    const html = templates.contactFormAdmin({
      name: evil,
      email: "a@example.com",
      phone: "",
      message: evil,
    }).html;
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('<a href="http://evil">');
    expect(html).toContain("&lt;script&gt;");
    const status = templates.statusChangedClient({
      name: evil,
      trackingCode: "RG-AAAAAAAA",
      statusLabel: "In progress",
      message: evil,
      trackUrl: "https://example.com/track",
    }).html;
    expect(status).not.toContain("<script>");
  });
  it("keep new lines out of the subject line", () => {
    const t = templates.contactFormAdmin({
      name: "Eve\r\nBcc: spy@example.com",
      email: "a@example.com",
      phone: "",
      message: "x",
    });
    expect(t.subject).not.toMatch(/[\r\n]/);
  });
  it("the new request email has no documents and no phone number", () => {
    const t = templates.requestSubmittedAdmin({
      trackingCode: "RG-AAAAAAAA",
      serviceName: "Service",
      clientName: "Client",
      adminUrl: "https://example.com/admin/requests/1",
    });
    expect(t.text + t.html).not.toMatch(/\+63|phone|document/i);
    expect(t.subject).toContain("RG-AAAAAAAA");
  });
  it("the client email has the tracking code, and the track link", () => {
    const t = templates.requestSubmittedClient({
      name: "Ana",
      trackingCode: "RG-7K3M9QXD",
      trackUrl: "https://example.com/track",
    });
    expect(t.text).toContain("RG-7K3M9QXD");
    expect(t.html).toContain("https://example.com/track");
  });
  it("the owner alert says what, who and when", () => {
    const t = templates.paymentMethodChangedOwner({
      who: "Staff",
      what: "QR changed",
      when: "now",
      adminUrl: "https://example.com/a",
    });
    expect(t.subject).toContain("ALERT");
    expect(t.text).toContain("QR changed");
  });
});

describe("sending with a log", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let requestId: string;
  const ctx = (fetchImpl: unknown, extra: Partial<EmailContext> = {}): EmailContext => ({
    brevo: config,
    baseUrl: "https://example.com",
    adminNotifyEmail: "zolb-test+admin@example.com",
    fetchImpl: fetchImpl as typeof fetch,
    ...extra,
  });

  beforeAll(async () => {
    t = await createTestDb();
    await t.db.insert(services).values({ slug: "svc", name: "Service" });
    const d = await createDraft(
      t.db,
      requestDetailsSchema.parse({
        serviceSlug: "svc",
        fullName: "Ana Client",
        email: "zolb-test+ana@example.com",
        phone: "9171234567",
        consent: true,
      }),
      { consentVersion: "v1", secret: "s" },
    );
    requestId = d.requestId;
    await changeStatus(t.db, { requestId, to: "submitted", actor: "client" });
  }, 60_000);
  afterAll(async () => t.close());

  it("writes a log row with the Brevo id when it works", async () => {
    const r = await sendRequestEmail(t.db, ctx(ok()), "request_submitted_client", requestId);
    expect(r.ok).toBe(true);
    const rows = await listEmailsForRequest(t.db, requestId);
    expect(rows[0]).toMatchObject({
      template: "request_submitted_client",
      toEmail: "zolb-test+ana@example.com",
      status: "sent",
    });
  });

  it("does not throw when Brevo fails, and logs a short error", async () => {
    const fail = vi.fn(async () => new Response("x", { status: 500 }));
    const r = await sendRequestEmail(t.db, ctx(fail), "request_submitted_admin", requestId);
    expect(r.ok).toBe(false);
    const failed = (await listEmailsForRequest(t.db, requestId)).find(
      (e) => e.status === "failed",
    )!;
    expect(failed).toMatchObject({
      template: "request_submitted_admin",
      error: "Brevo answered 500.",
    });
  });

  it("logs a clear note when the admin address is not set", async () => {
    const r = await sendRequestEmail(
      t.db,
      ctx(ok(), { adminNotifyEmail: undefined }),
      "request_submitted_admin",
      requestId,
    );
    expect(r.ok).toBe(false);
    expect(
      (await listEmailsForRequest(t.db, requestId)).some((e) =>
        e.error?.includes("ADMIN_NOTIFY_EMAIL"),
      ),
    ).toBe(true);
  });

  it("retries a failed email with a new send, and only failed request emails", async () => {
    const failed = (await listEmailsForRequest(t.db, requestId)).find(
      (e) =>
        e.status === "failed" &&
        e.template === "request_submitted_admin" &&
        e.toEmail !== "(not set)",
    )!;
    const f = ok();
    expect((await retryEmail(t.db, ctx(f), failed.id)).ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    const sent = (await listEmailsForRequest(t.db, requestId)).filter(
      (e) => e.template === "request_submitted_admin" && e.status === "sent",
    );
    expect(sent).toHaveLength(1);
    const okRow = (await listEmailsForRequest(t.db, requestId)).find((e) => e.status === "sent")!;
    expect(await retryEmail(t.db, ctx(ok()), okRow.id)).toEqual({
      ok: false,
      reason: "not-failed",
    });
    expect(await retryEmail(t.db, ctx(ok()), "00000000-0000-4000-8000-000000000000")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("a status email contains the message and the label", async () => {
    await t.db
      .update(requests)
      .set({ publicMessage: "Please send your ID." })
      .where(eq(requests.id, requestId));
    const f = ok();
    await sendRequestEmail(t.db, ctx(f), "status_changed_client", requestId);
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.subject).toContain("Submitted");
    expect(body.textContent).toContain("Please send your ID.");
  });

  it("stops at the daily limit without calling Brevo", async () => {
    const rows = Array.from({ length: DAILY_EMAIL_LIMIT }, () => ({
      template: "x",
      toEmail: "zolb-test+x@example.com",
      status: "sent" as const,
    }));
    await t.db.insert(emailLog).values(rows);
    expect(await emailsSentToday(t.db)).toBeGreaterThanOrEqual(DAILY_EMAIL_LIMIT);
    const f = ok();
    const r = await deliver(t.db, ctx(f), {
      template: "request_submitted_client",
      message,
      requestId,
    });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
    expect((await t.db.select().from(emailLog).where(eq(emailLog.id, r.logId)))[0].error).toContain(
      "300",
    );
  });

  it("only request emails can be retried", () => {
    expect(RETRYABLE).not.toContain("contact_form_admin");
    expect(RETRYABLE).not.toContain("payment_method_changed_owner");
  });
});

describe("payment acknowledgment email", () => {
  it("shows the payment values and says it is not an official receipt, with the Contact page note", () => {
    const t = templates.paymentVerifiedClient({
      name: "Ana",
      trackingCode: "RG-7K3M9QXD",
      amount: "₱1,250.00",
      method: "GCash",
      reference: "123456789012",
      paidOn: "Nov 6, 2026",
      trackUrl: "https://example.com/track",
    });
    for (const part of ["₱1,250.00", "GCash", "123456789012", "RG-7K3M9QXD"])
      expect(t.text).toContain(part);
    expect(t.text).toContain("not an official receipt");
    expect(t.text).toContain("Contact page");
    expect(t.html).toContain("Contact page");
    expect(t.subject).toContain("RG-7K3M9QXD");
  });
  it("escapes the client name", () => {
    const t = templates.paymentVerifiedClient({
      name: "<script>x</script>",
      trackingCode: "RG-AAAAAAAA",
      amount: "₱1.00",
      method: "GCash",
      reference: "ABC123",
      paidOn: "now",
      trackUrl: "https://example.com",
    });
    expect(t.html).not.toContain("<script>");
  });
});
