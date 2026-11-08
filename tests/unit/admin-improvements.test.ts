// Service delete (single and bulk), the paged services list, and the manual clean-up of the activity log.
// Test data uses zolb-test+...@example.com emails only.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requestDetailsSchema } from "@/lib/validation/request";
import type { PanelUser } from "@/server/auth/panel-core";
import { activityLog, serviceRequirements, services } from "@/server/db/schema";
import {
  ACTIVITY_PAGE_SIZE,
  PURGE_CHOICES_DAYS,
  countActivityOlderThan,
  exportActivityCsv,
  listActivity,
  purgeActivityLog,
} from "@/server/services/admin-overview";
import {
  SERVICES_PAGE_SIZE,
  deleteServices,
  listServicesPage,
} from "@/server/services/admin-settings";
import { changeStatus, createDraft } from "@/server/services/requests";

import { insertPanelUsers } from "../helpers/panel-users";
import { createTestDb } from "../helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let owner: PanelUser;
let admin: PanelUser;
let staff: PanelUser;
const fresh = { fresh2fa: true, ipHash: "hash" };
const notFresh = { fresh2fa: false };

const rejects = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e) => (e as { code?: string }).code ?? (e as Error).message,
  );

async function makeServices(n: number, prefix = "svc") {
  const rows = await t.db
    .insert(services)
    .values(
      Array.from({ length: n }, (_, i) => ({
        slug: `${prefix}-${i + 1}`,
        name: `${prefix} ${i + 1}`,
        sortOrder: i + 1,
      })),
    )
    .returning();
  return rows;
}

beforeAll(async () => {
  t = await createTestDb();
  [owner, admin, staff] = await insertPanelUsers(t.db, [
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
  ]);
}, 60_000);
afterAll(async () => t.close());

describe("the services list: 10 per page", () => {
  it("pages the list, keeps the order, and clamps a page that is too high", async () => {
    await makeServices(23, "page");
    expect(SERVICES_PAGE_SIZE).toBe(10);
    const first = await listServicesPage(t.db, { page: 1 });
    expect(first.rows).toHaveLength(10);
    expect(first.total).toBe(23);
    expect(first.pageCount).toBe(3);
    expect(first.rows.map((r) => r.name)).toEqual(
      Array.from({ length: 10 }, (_, i) => `page ${i + 1}`),
    );
    const third = await listServicesPage(t.db, { page: 3 });
    expect(third.rows).toHaveLength(3);
    const tooHigh = await listServicesPage(t.db, { page: 99 });
    expect(tooHigh.page).toBe(3);
    expect((await listServicesPage(t.db, { page: -5 })).page).toBe(1);
  });
});

describe("delete services (single and bulk)", () => {
  it("only admin and owner, and only with the fresh confirm", async () => {
    const [one] = await makeServices(1, "perm");
    expect(await rejects(deleteServices(t.db, staff, { ids: [one.id] }, fresh))).toBe("wrong-role");
    expect(await rejects(deleteServices(t.db, admin, { ids: [one.id] }, notFresh))).toBe(
      "needs-fresh-2fa",
    );
    expect(await t.db.select().from(services).where(eq(services.id, one.id))).toHaveLength(1);
    await deleteServices(t.db, owner, { ids: [one.id] }, fresh);
    expect(await t.db.select().from(services).where(eq(services.id, one.id))).toHaveLength(0);
  });

  it("deletes many at once, with their checklist, and logs each one", async () => {
    const rows = await makeServices(3, "bulk");
    await t.db.insert(serviceRequirements).values({ serviceId: rows[0].id, label: "Item" });
    const result = await deleteServices(t.db, admin, { ids: rows.map((r) => r.id) }, fresh);
    expect(result.deleted.map((d) => d.name).sort()).toEqual(["bulk 1", "bulk 2", "bulk 3"]);
    expect(result.skipped).toEqual([]);
    expect(
      await t.db
        .select()
        .from(serviceRequirements)
        .where(eq(serviceRequirements.serviceId, rows[0].id)),
    ).toHaveLength(0);
    const log = await t.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "service.deleted"));
    expect(
      log.filter((l) =>
        String(l.details && (l.details as { name?: string }).name).startsWith("bulk"),
      ),
    ).toHaveLength(3);
    expect(log.some((l) => l.actorId === admin.id && l.entityType === "service")).toBe(true);
  });

  it("keeps a service that requests used, and says so", async () => {
    const [used, free] = await makeServices(2, "used");
    const draft = await createDraft(
      t.db,
      requestDetailsSchema.parse({
        serviceSlug: used.slug,
        fullName: "Test Client",
        email: "zolb-test+r@example.com",
        phone: "9171234567",
        consent: true,
      }),
      { consentVersion: "v1", secret: "s" },
    );
    await changeStatus(t.db, { requestId: draft.requestId, to: "submitted", actor: "client" });
    const result = await deleteServices(t.db, owner, { ids: [used.id, free.id] }, fresh);
    expect(result.deleted.map((d) => d.id)).toEqual([free.id]);
    expect(result.skipped).toEqual([
      { id: used.id, name: "used 1", reason: "has-requests", requests: 1 },
    ]);
    expect(await t.db.select().from(services).where(eq(services.id, used.id))).toHaveLength(1);
  });

  it("refuses an empty choice, a bad id, and more than 100 at once; ignores an id that is not there", async () => {
    expect(await rejects(deleteServices(t.db, owner, { ids: [] }, fresh))).toBe("invalid");
    expect(await rejects(deleteServices(t.db, owner, { ids: ["not-an-id"] }, fresh))).toBe(
      "invalid",
    );
    const many = Array.from(
      { length: 101 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    expect(await rejects(deleteServices(t.db, owner, { ids: many }, fresh))).toBe("invalid");
    const ghost = "99999999-9999-4999-8999-999999999999";
    const result = await deleteServices(t.db, owner, { ids: [ghost] }, fresh).catch((e) => e);
    // Nothing was deleted: the answer lists the id as not found.
    expect(result.skipped?.[0]).toMatchObject({ id: ghost, reason: "not-found" });
  });

  it("the database also stops staff from deleting a service (second layer)", async () => {
    const [row] = await makeServices(1, "dbguard");
    const attempt = t.db.transaction(async (tx) => {
      const { setActor } = await import("@/server/db/actor");
      await setActor(tx, staff.id);
      await tx.delete(services).where(eq(services.id, row.id));
    });
    await expect(attempt).rejects.toThrow();
    expect(await t.db.select().from(services).where(eq(services.id, row.id))).toHaveLength(1);
  });
});

describe("the activity log: 20 per page", () => {
  it("pages 20 entries at a time", async () => {
    expect(ACTIVITY_PAGE_SIZE).toBe(20);
    await t.db.insert(activityLog).values(
      Array.from({ length: 45 }, (_, i) => ({
        actorType: "system" as const,
        action: `page.test.${i}`,
        entityType: "test",
      })),
    );
    const first = await listActivity(t.db, { action: "page.test" });
    expect(first.rows).toHaveLength(20);
    expect(first.total).toBe(45);
    expect(first.pageCount).toBe(3);
    expect((await listActivity(t.db, { action: "page.test", page: 3 })).rows).toHaveLength(5);
  });
});

describe("manual clean-up of the activity log", () => {
  async function insertOld(daysAgo: number, action: string) {
    // The log is append-only, so the trigger is switched off for this one setup step (test database only).
    await t.pg.exec(`alter table activity_log disable trigger activity_log_no_update_delete`);
    await t.pg.query(
      `insert into activity_log (actor_type, action, entity_type, created_at)
       values ('system', $1, 'test', now() - make_interval(days => $2))`,
      [action, daysAgo],
    );
    await t.pg.exec(`alter table activity_log enable trigger activity_log_no_update_delete`);
  }
  const countAction = async (action: string) =>
    Number(
      (
        await t.pg.query<{ n: number }>(
          `select count(*)::int as n from activity_log where action = $1`,
          [action],
        )
      ).rows[0].n,
    );

  it("removes only what is older than the chosen days, and writes its own entry", async () => {
    await insertOld(400, "purge.test.400");
    await insertOld(200, "purge.test.200");
    await insertOld(100, "purge.test.100");
    await insertOld(40, "purge.test.40");
    expect(PURGE_CHOICES_DAYS).toEqual([90, 180, 365]);
    expect(await countActivityOlderThan(t.db, 180)).toBeGreaterThanOrEqual(2);

    // The CSV copy comes first (the clean-up refuses without it).
    expect(await rejects(purgeActivityLog(t.db, admin, { olderThanDays: 180 }, fresh))).toBe("confirm-needed");
    expect(await countAction("purge.test.200")).toBe(1);
    await exportActivityCsv(t.db, admin, { olderThanDays: 180 });
    const result = await purgeActivityLog(t.db, admin, { olderThanDays: 180 }, fresh);
    expect(result.removed).toBeGreaterThanOrEqual(2);
    expect(await countAction("purge.test.400")).toBe(0);
    expect(await countAction("purge.test.200")).toBe(0);
    expect(await countAction("purge.test.100")).toBe(1);
    expect(await countAction("purge.test.40")).toBe(1);

    const entry = (
      await t.db.select().from(activityLog).where(eq(activityLog.action, "activity.purged"))
    )[0];
    expect(entry).toMatchObject({ actorId: admin.id });
    expect(entry.details).toMatchObject({ olderThanDays: 180, removed: result.removed });
  });

  it("needs admin or owner and the fresh confirm, and only the offered choices", async () => {
    expect(await rejects(purgeActivityLog(t.db, staff, { olderThanDays: 90 }, fresh))).toBe(
      "wrong-role",
    );
    expect(await rejects(purgeActivityLog(t.db, admin, { olderThanDays: 90 }, notFresh))).toBe(
      "needs-fresh-2fa",
    );
    for (const days of [0, 29, 31, 91, -1, 100000]) {
      expect(
        await rejects(purgeActivityLog(t.db, owner, { olderThanDays: days }, fresh)),
        String(days),
      ).toBe("invalid");
    }
    expect(await countAction("purge.test.40")).toBe(1);
  });

  it("the database never removes an entry younger than 30 days, and the log stays locked", async () => {
    const fn = (days: number) => t.pg.query(`select public.purge_activity_log_older_than(${days})`);
    await expect(fn(29)).rejects.toThrow(/older than 30 days/);
    await expect(fn(0)).rejects.toThrow();
    // A row from 10 days ago survives even a purge with the smallest allowed number.
    await insertOld(10, "purge.test.10");
    await fn(30);
    expect(await countAction("purge.test.10")).toBe(1);
    // Direct deletes are still refused, with or without the purge setting.
    await expect(t.pg.exec(`delete from activity_log`)).rejects.toThrow(/append-only/);
    await expect(
      t.pg.exec(
        `select set_config('app.activity_log_purge', 'on', false); delete from activity_log where action = 'purge.test.10'`,
      ),
    ).rejects.toThrow(/append-only/);
    await t.pg.exec(`select set_config('app.activity_log_purge', 'off', false)`);
  });
});

describe("the clean-up waits for the CSV copy", () => {
  async function oldRow(action: string) {
    await t.pg.exec(`alter table activity_log disable trigger activity_log_no_update_delete`);
    await t.pg.query(
      `insert into activity_log (actor_type, action, entity_type, created_at)
       values ('system', $1, 'test', now() - interval '400 days')`,
      [action],
    );
    await t.pg.exec(`alter table activity_log enable trigger activity_log_no_update_delete`);
  }

  it("refuses when the copy was for a different age, was made by someone else, or is too old", async () => {
    await oldRow("wait.test.1");
    // A copy for 90 days does not count for 365.
    await exportActivityCsv(t.db, owner, { olderThanDays: 90 });
    expect(await rejects(purgeActivityLog(t.db, owner, { olderThanDays: 365 }, fresh))).toBe("confirm-needed");
    // A copy made by another person does not count.
    await exportActivityCsv(t.db, admin, { olderThanDays: 365 });
    expect(await rejects(purgeActivityLog(t.db, owner, { olderThanDays: 365 }, fresh))).toBe("confirm-needed");
    // A copy older than 30 minutes does not count.
    await t.pg.exec(`alter table activity_log disable trigger activity_log_no_update_delete`);
    await t.pg.query(
      `insert into activity_log (actor_type, actor_id, action, entity_type, entity_id, details, created_at)
       values ('admin', $1, 'export.csv', 'export', 'activity', '{"olderThanDays":365}'::jsonb, now() - interval '31 minutes')`,
      [owner.id],
    );
    await t.pg.exec(`alter table activity_log enable trigger activity_log_no_update_delete`);
    expect(await rejects(purgeActivityLog(t.db, owner, { olderThanDays: 365 }, fresh))).toBe("confirm-needed");
    const left = await t.pg.query<{ n: number }>(`select count(*)::int as n from activity_log where action = 'wait.test.1'`);
    expect(left.rows[0].n).toBe(1);
  });

  it("works right after the person downloaded the copy for the same age", async () => {
    await exportActivityCsv(t.db, owner, { olderThanDays: 365 });
    const result = await purgeActivityLog(t.db, owner, { olderThanDays: 365 }, fresh);
    expect(result.removed).toBeGreaterThanOrEqual(1);
  });
});

describe("CSV copy before the clean-up", () => {
  it("lists the entries older than the chosen days, safely, and logs the download", async () => {
    const { exportActivityCsv } = await import("@/server/services/admin-overview");
    await t.pg.exec(`alter table activity_log disable trigger activity_log_no_update_delete`);
    await t.pg.query(
      `insert into activity_log (actor_type, action, entity_type, details, created_at)
       values ('system', 'csv.test.old', 'test', '{"note":"=1+1"}'::jsonb, now() - interval '300 days'),
              ('system', 'csv.test.new', 'test', '{}'::jsonb, now() - interval '5 days')`,
    );
    await t.pg.exec(`alter table activity_log enable trigger activity_log_no_update_delete`);

    const csv = await exportActivityCsv(t.db, owner, { olderThanDays: 180, ipHash: "h" });
    expect(csv.split("\r\n")[0]).toContain("Action");
    expect(csv).toContain("csv.test.old");
    expect(csv).not.toContain("csv.test.new");
    // A value that looks like a formula is not left as one (it is the content of the details text).
    expect(csv).not.toMatch(/(^|,)=1\+1/);
    const log = await t.db.select().from(activityLog).where(eq(activityLog.entityId, "activity"));
    expect(log.some((l) => l.action === "export.csv" && l.actorId === owner.id)).toBe(true);
  });
  it("needs admin or owner and one of the offered choices", async () => {
    const { exportActivityCsv } = await import("@/server/services/admin-overview");
    expect(await rejects(exportActivityCsv(t.db, staff, { olderThanDays: 90 }))).toBe("wrong-role");
    expect(await rejects(exportActivityCsv(t.db, admin, { olderThanDays: 7 }))).toBe("invalid");
  });
});
