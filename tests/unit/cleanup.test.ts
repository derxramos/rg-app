import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { requestDetailsSchema } from "@/lib/validation/request";
import { DRAFT_MAX_AGE_DAYS, runCleanup, runKeepAlive } from "@/server/jobs/cleanup-core";
import { activityLog, paymentMethods, payments, rateLimits, requestFiles, requests, services, siteSettings } from "@/server/db/schema";
import { createDraft } from "@/server/services/requests";
import type { StorageDriver } from "@/server/storage/types";

import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-12-01T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const BUCKET = "client-files";

let t: Awaited<ReturnType<typeof createTestDb>>;
let methodId: string;
// A fake storage: a set of existing paths, and an option to fail.
const stored = new Set<string>();
let failRemoval = false;
const storage: StorageDriver = {
  put: async (_b, p) => void stored.add(p),
  remove: async (_b, paths) => {
    if (failRemoval) throw new Error("storage is down");
    for (const p of paths) stored.delete(p);
  },
  signedUrl: async () => "x",
};

async function makeRequest(status: string, opts: { completed?: number; cancelled?: number; created?: number; draftExpires?: number; files?: number; payment?: boolean }) {
  const d = await createDraft(
    t.db,
    requestDetailsSchema.parse({ serviceSlug: "svc", fullName: "T", email: `zolb-test+${Math.random().toString(36).slice(2)}@example.com`, phone: "9171234567", consent: true }),
    { consentVersion: "v1", secret: "s", now: daysAgo(opts.created ?? 1) },
  );
  await t.db
    .update(requests)
    .set({
      status: status as never,
      createdAt: daysAgo(opts.created ?? 1),
      completedAt: opts.completed !== undefined ? daysAgo(opts.completed) : null,
      cancelledAt: opts.cancelled !== undefined ? daysAgo(opts.cancelled) : null,
      draftExpiresAt: status === "draft" ? daysAgo(opts.draftExpires ?? -5) : null,
    })
    .where(eq(requests.id, d.requestId));
  const paths: string[] = [];
  for (let i = 0; i < (opts.files ?? 0); i++) {
    const p = `requests/${d.requestId}/${i}.pdf`;
    paths.push(p);
    stored.add(p);
    await t.db.insert(requestFiles).values({ requestId: d.requestId, storagePath: p, originalName: `f${i}.pdf`, mimeType: "application/pdf", sizeBytes: 10 });
  }
  if (opts.payment) {
    await t.db.insert(payments).values({ requestId: d.requestId, paymentMethodId: methodId, methodSnapshot: {}, referenceNumber: `REF${Math.random().toString(36).slice(2, 10).toUpperCase()}`, amountCentavos: 100, paidOn: "2026-11-01", entryMethod: "manual" });
  }
  return { id: d.requestId, paths };
}

const request = async (id: string) => (await t.db.select().from(requests).where(eq(requests.id, id)))[0];
const live = async (id: string) => (await t.db.select().from(requestFiles).where(eq(requestFiles.requestId, id))).filter((f) => !f.deletedAt).length;

beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(services).values({ slug: "svc", name: "Service" });
  [{ id: methodId }] = await t.db.insert(paymentMethods).values({ name: "GCash", accountName: "x", accountNumber: "1" }).returning();
  vi.spyOn(console, "error").mockImplementation(() => {});
}, 60_000);
afterAll(async () => t.close());

describe("cleanup job: deletes the right files and only those", () => {
  it("deletes files of requests Completed or Cancelled MORE than 30 days ago, and nothing else", async () => {
    const completedOld = await makeRequest("completed", { completed: 31, files: 2 });
    const completedNew = await makeRequest("completed", { completed: 29, files: 1 });
    const cancelledOld = await makeRequest("cancelled", { cancelled: 40, files: 1 });
    const inProgress = await makeRequest("in_progress", { created: 100, files: 1 });
    const submittedOld = await makeRequest("submitted", { created: 200, files: 1 });
    const waiting = await makeRequest("waiting_for_client", { created: 90, files: 1 });
    const draftRecent = await makeRequest("draft", { created: 2, draftExpires: -5, files: 1 });

    const summary = await runCleanup(t.db, storage, { clientFilesBucket: BUCKET, now: NOW });

    expect(summary).toMatchObject({ retentionDays: 30, closedRequestsCleaned: 2, filesDeleted: 3, errors: 0 });
    // Deleted from storage AND marked in the database:
    for (const r of [completedOld, cancelledOld]) {
      expect(r.paths.every((p) => !stored.has(p))).toBe(true);
      expect(await live(r.id)).toBe(0);
      expect((await request(r.id)).filesDeletedAt).not.toBeNull();
    }
    // Everything else is untouched:
    for (const r of [completedNew, inProgress, submittedOld, waiting, draftRecent]) {
      expect(r.paths.every((p) => stored.has(p)), r.id).toBe(true);
      expect(await live(r.id)).toBe(1);
      expect((await request(r.id)).filesDeletedAt).toBeNull();
    }
  });

  it("follows the file_retention_days setting", async () => {
    const r = await makeRequest("completed", { completed: 12, files: 1 });
    await runCleanup(t.db, storage, { clientFilesBucket: BUCKET, now: NOW });
    expect(await live(r.id)).toBe(1);
    await t.db.insert(siteSettings).values({ key: "file_retention_days", value: 10 });
    const summary = await runCleanup(t.db, storage, { clientFilesBucket: BUCKET, now: NOW });
    expect(summary.retentionDays).toBe(10);
    expect(await live(r.id)).toBe(0);
    await t.db.delete(siteSettings).where(eq(siteSettings.key, "file_retention_days"));
  });

  it("deletes drafts that were never sent after 7 days, with their files and payment, and keeps recent ones", async () => {
    const oldDraft = await makeRequest("draft", { created: DRAFT_MAX_AGE_DAYS + 1, draftExpires: 1, files: 2, payment: true });
    const recentDraft = await makeRequest("draft", { created: 2, draftExpires: -5, files: 1 });
    const summary = await runCleanup(t.db, storage, { clientFilesBucket: BUCKET, now: NOW });
    expect(summary.draftsDeleted).toBeGreaterThanOrEqual(1);
    expect(await t.db.select().from(requests).where(eq(requests.id, oldDraft.id))).toHaveLength(0);
    expect(await t.db.select().from(payments).where(eq(payments.requestId, oldDraft.id))).toHaveLength(0);
    expect(oldDraft.paths.every((p) => !stored.has(p))).toBe(true);
    expect(await t.db.select().from(requests).where(eq(requests.id, recentDraft.id))).toHaveLength(1);
    expect(stored.has(recentDraft.paths[0])).toBe(true);
  });

  it("never deletes a sent request, even an old one with a payment", async () => {
    const r = await makeRequest("payment_submitted", { created: 365, files: 1, payment: true });
    await runCleanup(t.db, storage, { clientFilesBucket: BUCKET, now: NOW });
    expect(await t.db.select().from(requests).where(eq(requests.id, r.id))).toHaveLength(1);
    expect(stored.has(r.paths[0])).toBe(true);
  });

  it("deletes from storage FIRST: when storage fails, the database is not changed, and the next run finishes the job", async () => {
    const r = await makeRequest("completed", { completed: 45, files: 1 });
    failRemoval = true;
    const failed = await runCleanup(t.db, storage, { clientFilesBucket: BUCKET, now: NOW });
    expect(failed.errors).toBeGreaterThanOrEqual(1);
    expect(await live(r.id)).toBe(1);
    expect((await request(r.id)).filesDeletedAt).toBeNull();
    expect(stored.has(r.paths[0])).toBe(true);

    failRemoval = false;
    const ok = await runCleanup(t.db, storage, { clientFilesBucket: BUCKET, now: NOW });
    expect(ok.errors).toBe(0);
    expect(await live(r.id)).toBe(0);
    expect(stored.has(r.paths[0])).toBe(false);
  });

  it("is safe to run again: the second run has nothing to do", async () => {
    await runCleanup(t.db, storage, { clientFilesBucket: BUCKET, now: NOW });
    const again = await runCleanup(t.db, storage, { clientFilesBucket: BUCKET, now: NOW });
    expect(again).toMatchObject({ closedRequestsCleaned: 0, filesDeleted: 0, draftsDeleted: 0, errors: 0 });
  });

  it("removes old rate limit rows and keeps new ones", async () => {
    await t.db.insert(rateLimits).values([
      { key: "old", windowStart: daysAgo(3), count: 1 },
      { key: "new", windowStart: daysAgo(0), count: 1 },
    ]);
    const summary = await runCleanup(t.db, storage, { clientFilesBucket: BUCKET, now: NOW });
    expect(summary.rateLimitRowsDeleted).toBeGreaterThanOrEqual(1);
    const keys = (await t.db.select().from(rateLimits)).map((r) => r.key);
    expect(keys).toContain("new");
    expect(keys).not.toContain("old");
  });

  it("purges activity log rows older than 1 year and keeps newer ones", async () => {
    await t.pg.exec(`alter table activity_log disable trigger activity_log_no_update_delete`);
    await t.db.insert(activityLog).values([
      { actorType: "system", action: "old.row", entityType: "t", createdAt: daysAgo(400) },
      { actorType: "system", action: "recent.row", entityType: "t", createdAt: daysAgo(100) },
    ]);
    await t.pg.exec(`alter table activity_log enable trigger activity_log_no_update_delete`);
    await runCleanup(t.db, storage, { clientFilesBucket: BUCKET, now: NOW });
    const actions = (await t.db.select().from(activityLog)).map((l) => l.action);
    expect(actions).toContain("recent.row");
    expect(actions).not.toContain("old.row");
  });

  it("writes a summary to the activity log and records the time", async () => {
    await runCleanup(t.db, storage, { clientFilesBucket: BUCKET, now: NOW });
    const runs = (await t.db.select().from(activityLog)).filter((l) => l.action === "cleanup.run");
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.at(-1)!.actorType).toBe("system");
    expect(runs.at(-1)!.details).toMatchObject({ errors: 0 });
    const [last] = await t.db.select().from(siteSettings).where(eq(siteSettings.key, "last_cleanup_at"));
    expect(last.value).toBe(NOW.toISOString());
  });
});

describe("keep-alive job", () => {
  it("runs a tiny query and records the time", async () => {
    await runKeepAlive(t.db, NOW);
    const [row] = await t.db.select().from(siteSettings).where(eq(siteSettings.key, "last_keep_alive_at"));
    expect(row.value).toBe(NOW.toISOString());
  });
});
