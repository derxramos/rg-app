import "server-only";

// Dashboard numbers, the activity log list, and the CSV export queries.
import { and, count, desc, eq, gte, inArray, isNull, like, lt, sql } from "drizzle-orm";

import type { RequestStatus } from "@/lib/status";
import { addDaysToIsoDate } from "@/lib/time";
import { DEFAULT_SETTINGS, parseSetting } from "@/lib/validation/settings";
import { assertCan, PanelAuthError, type PanelUser } from "@/server/auth/panel-core";
import { setActor } from "@/server/db/actor";
import {
  activityLog,
  profiles,
  emailLog,
  payments,
  requestFiles,
  requests,
  services,
  siteSettings,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { STORAGE_LIMIT_BYTES, storageUsedBytes } from "@/server/services/files";
import { toCsv } from "@/server/services/csv";

const manilaStart = (isoDate: string) => new Date(`${isoDate}T00:00:00+08:00`);

export async function getDashboard(db: AppDb, now: Date = new Date()) {
  const statusCounts = await db
    .select({ status: requests.status, n: count() })
    .from(requests)
    .groupBy(requests.status);
  const byStatus = Object.fromEntries(statusCounts.map((r) => [r.status, r.n])) as Partial<
    Record<RequestStatus, number>
  >;

  const needsAction = await db
    .select({
      id: requests.id,
      trackingCode: requests.trackingCode,
      clientFullName: requests.clientFullName,
      status: requests.status,
      createdAt: requests.createdAt,
      serviceName: services.name,
    })
    .from(requests)
    .innerJoin(services, eq(services.id, requests.serviceId))
    .where(inArray(requests.status, ["submitted", "payment_submitted"]))
    .orderBy(desc(requests.createdAt))
    .limit(10);

  const used = await storageUsedBytes(db);
  const settings = await db
    .select()
    .from(siteSettings)
    .where(
      inArray(siteSettings.key, [
        "storage_warning_percent",
        "last_cleanup_at",
        "last_keep_alive_at",
      ]),
    );
  const get = (key: string) => settings.find((s) => s.key === key)?.value;
  const warningPercent =
    get("storage_warning_percent") !== undefined
      ? parseSetting("storage_warning_percent", get("storage_warning_percent"))
      : DEFAULT_SETTINGS.storage_warning_percent;
  const percent = Math.min(100, (used / STORAGE_LIMIT_BYTES) * 100);

  // The day starts at midnight in Manila.
  const dayStart = manilaStart(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now),
  );
  const [{ sent }] = await db
    .select({ sent: count() })
    .from(emailLog)
    .where(and(gte(emailLog.createdAt, dayStart), eq(emailLog.status, "sent")));

  const [lastMethodChange] = await db
    .select({ createdAt: activityLog.createdAt, name: profiles.fullName })
    .from(activityLog)
    .leftJoin(profiles, eq(profiles.id, activityLog.actorId))
    .where(like(activityLog.action, "payment_method.%"))
    .orderBy(desc(activityLog.createdAt))
    .limit(1);

  const age = (value: unknown) =>
    typeof value === "string" ? (now.getTime() - new Date(value).getTime()) / 86_400_000 : null;
  const lastCleanup = (get("last_cleanup_at") as string | null | undefined) ?? null;
  const lastKeepAlive = (get("last_keep_alive_at") as string | null | undefined) ?? null;

  return {
    byStatus,
    needsAction,
    storage: {
      usedBytes: used,
      limitBytes: STORAGE_LIMIT_BYTES,
      percent,
      tone:
        percent >= 95
          ? ("danger" as const)
          : percent >= warningPercent
            ? ("warning" as const)
            : ("default" as const),
    },
    emails: { sentToday: sent, limit: 300 },
    jobs: {
      lastCleanup,
      lastKeepAlive,
      // A warning when the job has never run or is more than 3 days old.
      cleanupStale: age(lastCleanup) === null || (age(lastCleanup) as number) > 3,
      keepAliveStale: age(lastKeepAlive) === null || (age(lastKeepAlive) as number) > 3,
    },
    lastMethodChange: lastMethodChange ?? null,
  };
}

export type ActivityFilters = {
  action?: string;
  actorId?: string;
  from?: string;
  to?: string;
  page?: number;
};
export const ACTIVITY_PAGE_SIZE = 20;

export async function listActivity(db: AppDb, filters: ActivityFilters = {}) {
  const conditions = [];
  if (filters.action)
    conditions.push(like(activityLog.action, `${filters.action.replace(/[%_\\]/g, "\\$&")}%`));
  if (filters.actorId) conditions.push(eq(activityLog.actorId, filters.actorId));
  if (filters.from) conditions.push(gte(activityLog.createdAt, manilaStart(filters.from)));
  if (filters.to)
    conditions.push(lt(activityLog.createdAt, manilaStart(addDaysToIsoDate(filters.to, 1))));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const page = Math.max(1, filters.page ?? 1);

  const rows = await db
    .select({
      id: activityLog.id,
      action: activityLog.action,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      actorType: activityLog.actorType,
      actorName: profiles.fullName,
      details: activityLog.details,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .leftJoin(profiles, eq(profiles.id, activityLog.actorId))
    .where(where)
    .orderBy(desc(activityLog.id))
    .limit(ACTIVITY_PAGE_SIZE)
    .offset((page - 1) * ACTIVITY_PAGE_SIZE);
  const [{ total }] = await db.select({ total: count() }).from(activityLog).where(where);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE)) };
}

// ---------- Manual clean-up of the activity log ----------
// The log is append-only. Entries older than 1 year are removed by the daily job. Owner and admin can also clean up
// by hand (entries older than 90, 180 or 365 days; the database refuses anything younger than 30 days, whoever asks).
// It needs a fresh confirm, and the clean-up itself is written to the log (that new row stays).
export const PURGE_CHOICES_DAYS = [90, 180, 365] as const;

export async function countActivityOlderThan(db: AppDb, days: number): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(activityLog)
    .where(lt(activityLog.createdAt, new Date(Date.now() - days * 24 * 60 * 60 * 1000)));
  return n;
}

export async function purgeActivityLog(
  db: AppDb,
  actor: PanelUser,
  input: { olderThanDays: number },
  context: { fresh2fa: boolean; ipHash?: string | null },
): Promise<{ removed: number }> {
  assertCan(actor, "activity.purge");
  if (!context.fresh2fa) throw new PanelAuthError("needs-fresh-2fa");
  if (!(PURGE_CHOICES_DAYS as readonly number[]).includes(input.olderThanDays))
    throw Object.assign(new Error("Choose 90, 180 or 365 days."), { code: "invalid" });

  return db.transaction(async (tx) => {
    await setActor(tx, actor.id);
    // A copy must be downloaded first: this person must have downloaded the CSV for the same age in the last
    // 30 minutes (the download is logged). Not needed when there is nothing old to remove.
    if ((await countActivityOlderThan(tx as unknown as AppDb, input.olderThanDays)) > 0) {
      const [{ n }] = await tx
        .select({ n: count() })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.actorId, actor.id),
            eq(activityLog.action, "export.csv"),
            eq(activityLog.entityId, "activity"),
            gte(activityLog.createdAt, new Date(Date.now() - 30 * 60 * 1000)),
            sql`${activityLog.details} ->> 'olderThanDays' = ${String(input.olderThanDays)}`,
          ),
        );
      if (n === 0)
        throw Object.assign(
          new Error("Please download the CSV copy of these entries first, then try again."),
          { code: "confirm-needed" },
        );
    }
    const result = await tx.execute(
      sql`select public.purge_activity_log_older_than(${input.olderThanDays}) as removed`,
    );
    const rows = (
      Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    ) as {
      removed: string | number;
    }[];
    const removed = Number(rows[0]?.removed ?? 0);
    await tx.insert(activityLog).values({
      actorType: "admin",
      actorId: actor.id,
      action: "activity.purged",
      entityType: "activity_log",
      details: { olderThanDays: input.olderThanDays, removed },
      ipHash: context.ipHash ?? null,
    });
    return { removed };
  });
}

// The entries that a clean-up would remove, as a CSV file (so they can be kept before they are deleted).
// Same permission as the clean-up (admin and owner). The download is written to the log (that entry is newer, so it stays).
export const ACTIVITY_CSV_MAX_ROWS = 100_000;

export async function exportActivityCsv(
  db: AppDb,
  actor: PanelUser,
  input: { olderThanDays: number; ipHash?: string | null },
): Promise<string> {
  assertCan(actor, "activity.purge");
  if (!(PURGE_CHOICES_DAYS as readonly number[]).includes(input.olderThanDays))
    throw Object.assign(new Error("Choose 90, 180 or 365 days."), { code: "invalid" });

  const cutoff = new Date(Date.now() - input.olderThanDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: activityLog.id,
      createdAt: activityLog.createdAt,
      actorName: profiles.fullName,
      actorType: activityLog.actorType,
      action: activityLog.action,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      details: activityLog.details,
    })
    .from(activityLog)
    .leftJoin(profiles, eq(profiles.id, activityLog.actorId))
    .where(lt(activityLog.createdAt, cutoff))
    .orderBy(activityLog.id)
    .limit(ACTIVITY_CSV_MAX_ROWS);

  await db.insert(activityLog).values({
    actorType: "admin",
    actorId: actor.id,
    action: "export.csv",
    entityType: "export",
    entityId: "activity",
    details: { type: "activity", olderThanDays: input.olderThanDays, rows: rows.length },
    ipHash: input.ipHash ?? null,
  });
  return toCsv(
    ["ID", "Time (UTC)", "Who", "Action", "Entity type", "Entity id", "Details"],
    rows.map((r) => [
      r.id,
      r.createdAt,
      r.actorName || (r.actorType === "system" ? "System" : r.actorType),
      r.action,
      r.entityType,
      r.entityId,
      JSON.stringify(r.details ?? {}),
    ]),
  );
}

// ---------- CSV export (owner only; every export is logged) ----------

export type ExportType = "requests" | "payments";

export async function exportCsv(
  db: AppDb,
  actor: PanelUser,
  input: { type: ExportType; from?: string; to?: string; ipHash?: string | null },
): Promise<string> {
  assertCan(actor, "export.csv");

  const range = (column: typeof requests.createdAt | typeof payments.createdAt) => [
    ...(input.from ? [gte(column, manilaStart(input.from))] : []),
    ...(input.to ? [lt(column, manilaStart(addDaysToIsoDate(input.to, 1)))] : []),
  ];

  let csv: string;
  let rowCount: number;
  if (input.type === "requests") {
    const rows = await db
      .select({
        code: requests.trackingCode,
        status: requests.status,
        service: services.name,
        name: requests.clientFullName,
        email: requests.clientEmail,
        phone: requests.clientPhone,
        business: requests.businessName,
        created: requests.createdAt,
        submitted: requests.submittedAt,
        completed: requests.completedAt,
      })
      .from(requests)
      .innerJoin(services, eq(services.id, requests.serviceId))
      .where(and(...range(requests.createdAt)))
      .orderBy(desc(requests.createdAt));
    rowCount = rows.length;
    csv = toCsv(
      [
        "Tracking code",
        "Status",
        "Service",
        "Name",
        "Email",
        "Phone",
        "Business",
        "Created",
        "Submitted",
        "Completed",
      ],
      rows.map((r) => [
        r.code,
        r.status,
        r.service,
        r.name,
        r.email,
        r.phone,
        r.business,
        r.created,
        r.submitted,
        r.completed,
      ]),
    );
  } else {
    const rows = await db
      .select({
        code: requests.trackingCode,
        snapshot: payments.methodSnapshot,
        reference: payments.referenceNumber,
        amount: payments.amountCentavos,
        paidOn: payments.paidOn,
        entry: payments.entryMethod,
        status: payments.status,
        created: payments.createdAt,
      })
      .from(payments)
      .innerJoin(requests, eq(requests.id, payments.requestId))
      .where(and(...range(payments.createdAt)))
      .orderBy(desc(payments.createdAt));
    rowCount = rows.length;
    csv = toCsv(
      [
        "Tracking code",
        "Method",
        "Reference",
        "Amount (PHP)",
        "Paid on",
        "Entry",
        "Status",
        "Created",
      ],
      rows.map((r) => [
        r.code,
        (r.snapshot as { name?: string }).name,
        r.reference,
        (r.amount / 100).toFixed(2),
        r.paidOn,
        r.entry,
        r.status,
        r.created,
      ]),
    );
  }

  await db.insert(activityLog).values({
    actorType: "admin",
    actorId: actor.id,
    action: "export.csv",
    entityType: "export",
    entityId: input.type,
    details: { type: input.type, from: input.from ?? null, to: input.to ?? null, rows: rowCount },
    ipHash: input.ipHash ?? null,
  });
  return csv;
}

// Used by the dashboard text "files stored".
export async function countLiveFiles(db: AppDb) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(requestFiles)
    .where(isNull(requestFiles.deletedAt));
  return n;
}
