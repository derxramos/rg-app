import "server-only";

// Dashboard numbers, the activity log list, and the CSV export queries.
import { and, count, desc, eq, gte, inArray, isNull, like, lt } from "drizzle-orm";

import type { RequestStatus } from "@/lib/status";
import { addDaysToIsoDate } from "@/lib/time";
import { DEFAULT_SETTINGS, parseSetting } from "@/lib/validation/settings";
import { AdminAuthError, OWNER_ONLY, hasRole, type AdminProfile } from "@/server/auth/admin-core";
import {
  activityLog,
  adminProfiles,
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
    .select({ createdAt: activityLog.createdAt, name: adminProfiles.fullName })
    .from(activityLog)
    .leftJoin(adminProfiles, eq(adminProfiles.id, activityLog.actorId))
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
export const ACTIVITY_PAGE_SIZE = 50;

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
      actorName: adminProfiles.fullName,
      details: activityLog.details,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .leftJoin(adminProfiles, eq(adminProfiles.id, activityLog.actorId))
    .where(where)
    .orderBy(desc(activityLog.id))
    .limit(ACTIVITY_PAGE_SIZE)
    .offset((page - 1) * ACTIVITY_PAGE_SIZE);
  const [{ total }] = await db.select({ total: count() }).from(activityLog).where(where);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE)) };
}

// ---------- CSV export (owner only; every export is logged) ----------

export type ExportType = "requests" | "payments";

export async function exportCsv(
  db: AppDb,
  actor: AdminProfile,
  input: { type: ExportType; from?: string; to?: string; ipHash?: string | null },
): Promise<string> {
  if (!hasRole(actor, OWNER_ONLY)) throw new AdminAuthError("wrong-role");

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
