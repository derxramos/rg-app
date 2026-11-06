// The daily cleanup job (docs/ARCHITECTURE.md section 9). No "server-only" import: the Node script in
// /scripts runs it from GitHub Actions. It takes the database and the storage as arguments, so tests run
// it on a test database with a fake storage.
//
// It does three kinds of cleaning, and ONLY these:
//   1. Files of requests that were Completed or Cancelled more than N days ago (N = file_retention_days).
//   2. Draft requests that were never sent and are older than 7 days, with their files.
//   3. Old rate_limits rows, and activity_log rows older than 1 year.
// The storage file is deleted FIRST. The database is changed only after that worked. If one step fails, the
// request stays in the list and is tried again the next day.

import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { DEFAULT_SETTINGS, parseSetting } from "../../lib/validation/settings";
import { activityLog, payments, rateLimits, requestFiles, requests, siteSettings } from "../db/schema";
import type { AppDb } from "../db/types";
import type { StorageDriver } from "../storage/types";

export const DRAFT_MAX_AGE_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

export type CleanupSummary = {
  retentionDays: number;
  closedRequestsCleaned: number;
  filesDeleted: number;
  draftsDeleted: number;
  draftFilesDeleted: number;
  rateLimitRowsDeleted: number;
  errors: number;
};

async function liveFiles(db: AppDb, requestIds: string[]) {
  if (requestIds.length === 0) return [];
  return db
    .select({ id: requestFiles.id, requestId: requestFiles.requestId, path: requestFiles.storagePath })
    .from(requestFiles)
    .where(and(inArray(requestFiles.requestId, requestIds), isNull(requestFiles.deletedAt)));
}

export async function runCleanup(
  db: AppDb,
  storage: StorageDriver,
  options: { clientFilesBucket: string; now?: Date },
): Promise<CleanupSummary> {
  const now = options.now ?? new Date();
  const summary: CleanupSummary = {
    retentionDays: DEFAULT_SETTINGS.file_retention_days,
    closedRequestsCleaned: 0,
    filesDeleted: 0,
    draftsDeleted: 0,
    draftFilesDeleted: 0,
    rateLimitRowsDeleted: 0,
    errors: 0,
  };

  const [setting] = await db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, "file_retention_days"));
  if (setting) summary.retentionDays = parseSetting("file_retention_days", setting.value);
  const cutoff = new Date(now.getTime() - summary.retentionDays * DAY);

  // ---------- 1. Files of Completed and Cancelled requests ----------
  const closed = await db
    .select({ id: requests.id })
    .from(requests)
    .where(
      and(
        inArray(requests.status, ["completed", "cancelled"]),
        isNull(requests.filesDeletedAt),
        or(
          and(eq(requests.status, "completed"), isNotNull(requests.completedAt), lt(requests.completedAt, cutoff)),
          and(eq(requests.status, "cancelled"), isNotNull(requests.cancelledAt), lt(requests.cancelledAt, cutoff)),
        ),
      ),
    );

  for (const { id } of closed) {
    try {
      const files = await liveFiles(db, [id]);
      if (files.length > 0) await storage.remove(options.clientFilesBucket, files.map((f) => f.path));
      // Storage worked. Now the database (the file rows stay, marked as deleted, for the record).
      await db.transaction(async (tx) => {
        if (files.length > 0) {
          await tx.update(requestFiles).set({ deletedAt: now }).where(inArray(requestFiles.id, files.map((f) => f.id)));
        }
        await tx.update(requests).set({ filesDeletedAt: now }).where(eq(requests.id, id));
      });
      summary.closedRequestsCleaned += 1;
      summary.filesDeleted += files.length;
    } catch (error) {
      summary.errors += 1;
      console.error(`Cleanup: could not clean the files of request ${id}:`, error);
    }
  }

  // ---------- 2. Drafts that were never sent ----------
  const draftCutoff = new Date(now.getTime() - DRAFT_MAX_AGE_DAYS * DAY);
  const drafts = await db
    .select({ id: requests.id })
    .from(requests)
    .where(
      and(
        eq(requests.status, "draft"),
        or(and(isNotNull(requests.draftExpiresAt), lt(requests.draftExpiresAt, now)), lt(requests.createdAt, draftCutoff)),
      ),
    );

  for (const { id } of drafts) {
    try {
      const files = await liveFiles(db, [id]);
      if (files.length > 0) await storage.remove(options.clientFilesBucket, files.map((f) => f.path));
      await db.transaction(async (tx) => {
        // A payment row blocks deleting its request, and a draft was never sent, so it goes too.
        await tx.delete(payments).where(eq(payments.requestId, id));
        // The timeline, file rows and notes go with it (cascade).
        await tx.delete(requests).where(and(eq(requests.id, id), eq(requests.status, "draft")));
      });
      summary.draftsDeleted += 1;
      summary.draftFilesDeleted += files.length;
    } catch (error) {
      summary.errors += 1;
      console.error(`Cleanup: could not delete draft ${id}:`, error);
    }
  }

  // ---------- 3. Old counters and old log rows ----------
  const oldLimits = await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - DAY))).returning({ key: rateLimits.key });
  summary.rateLimitRowsDeleted = oldLimits.length;
  try {
    // The only way to remove log rows: a database function that removes rows older than 1 year.
    await db.execute(sql`select public.purge_old_activity_log()`);
  } catch (error) {
    summary.errors += 1;
    console.error("Cleanup: could not purge the old activity log:", error);
  }

  // ---------- Write down what happened ----------
  await db.insert(activityLog).values({ actorType: "system", action: "cleanup.run", entityType: "job", details: { ...summary, at: now.toISOString() } });
  await db
    .insert(siteSettings)
    .values({ key: "last_cleanup_at", value: now.toISOString() })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: now.toISOString() } });

  return summary;
}

// The keep-alive job: one tiny query, so the free Supabase project does not pause after 7 quiet days.
export async function runKeepAlive(db: AppDb, now: Date = new Date()): Promise<void> {
  await db.execute(sql`select 1`);
  await db
    .insert(siteSettings)
    .values({ key: "last_keep_alive_at", value: now.toISOString() })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: now.toISOString() } });
}
