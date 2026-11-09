import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PRIVACY_TEMPLATE } from "@/content/privacy-notice";
import { todayInManila } from "@/lib/time";
import type { PanelUser } from "@/server/auth/panel-core";
import { activityLog, legalDocuments } from "@/server/db/schema";
import {
  builtInLegal,
  getCurrentLegal,
  getCurrentLegalVersion,
  getLegalVersion,
  listLegalVersions,
  saveLegalDocument,
} from "@/server/services/legal";

import { insertPanelUsers } from "../helpers/panel-users";
import { createTestDb } from "../helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let owner: PanelUser;
let admin: PanelUser;
let staff: PanelUser;

const rejects = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e) => (e as { code?: string }).code ?? (e as Error).message,
  );
const text = (word: string) =>
  `## ${word}\n\n${"This is sample legal text for a test. ".repeat(10)}`;

beforeAll(async () => {
  t = await createTestDb();
  [owner, admin, staff] = await insertPanelUsers(t.db, [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      fullName: "Owner One",
      email: "zolb-test+lo@example.com",
      role: "owner",
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      fullName: "Admin One",
      email: "zolb-test+la@example.com",
      role: "admin",
    },
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      fullName: "Staff One",
      email: "zolb-test+ls@example.com",
      role: "staff",
    },
  ]);
}, 60_000);
afterAll(async () => t.close());

describe("legal documents", () => {
  it("shows the built-in text until a version is saved", async () => {
    const current = await getCurrentLegal(t.db, "privacy");
    expect(current.isBuiltIn).toBe(true);
    expect(current.body).toBe(PRIVACY_TEMPLATE);
    expect(current.version).toBe(builtInLegal("privacy").version);
    expect(await getCurrentLegalVersion(t.db, "terms")).toMatch(/\.0$/);
  });

  it("staff cannot save, admin and owner can", async () => {
    expect(
      await rejects(saveLegalDocument(t.db, staff, { kind: "privacy", body: text("Staff") })),
    ).toBe("wrong-role");
    expect(await t.db.select().from(legalDocuments)).toHaveLength(0);
    await saveLegalDocument(t.db, admin, { kind: "terms", body: text("By admin") });
    await saveLegalDocument(t.db, owner, { kind: "terms", body: text("By owner") });
  });

  it("makes the version itself (day and counter) and the newest one is current", async () => {
    const today = todayInManila();
    expect((await getCurrentLegal(t.db, "terms")).version).toBe(`${today}.2`);
    const first = await saveLegalDocument(t.db, owner, { kind: "privacy", body: text("One") });
    const second = await saveLegalDocument(t.db, owner, { kind: "privacy", body: text("Two") });
    expect([first.version, second.version]).toEqual([`${today}.1`, `${today}.2`]);
    const current = await getCurrentLegal(t.db, "privacy");
    expect(current).toMatchObject({ version: `${today}.2`, isBuiltIn: false });
    expect(current.body).toContain("Two");
  });

  it("keeps the history: old text stays readable, the built-in text is the last row", async () => {
    const today = todayInManila();
    const rows = await listLegalVersions(t.db, "privacy");
    expect(rows.map((r) => r.version)).toEqual([
      `${today}.2`,
      `${today}.1`,
      builtInLegal("privacy").version,
    ]);
    expect(rows[0].createdByName).toBe("Owner One");
    expect((await getLegalVersion(t.db, "privacy", `${today}.1`))?.body).toContain("One");
    expect(
      (await getLegalVersion(t.db, "privacy", builtInLegal("privacy").version))?.isBuiltIn,
    ).toBe(true);
    expect(await getLegalVersion(t.db, "privacy", "nope")).toBeNull();
  });

  it("refuses a bad kind, a too short text and a text that did not change", async () => {
    expect(
      await rejects(saveLegalDocument(t.db, owner, { kind: "cookies", body: text("X") })),
    ).toBe("invalid");
    expect(await rejects(saveLegalDocument(t.db, owner, { kind: "privacy", body: "short" }))).toBe(
      "invalid",
    );
    expect(
      await rejects(
        saveLegalDocument(t.db, owner, { kind: "privacy", body: text("Two") + "\r\n" }),
      ),
    ).toBe("invalid");
    expect(
      await rejects(saveLegalDocument(t.db, owner, { kind: "terms", body: text("By owner") })),
    ).toBe("invalid");
  });

  it("writes every save to the activity log", async () => {
    const rows = await t.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "legal.published"));
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.actorId !== null && r.entityType === "legal_document")).toBe(true);
    expect(rows.map((r) => r.entityId)).toContain(`privacy:${todayInManila()}.2`);
  });

  it("the database refuses to change or delete a saved version", async () => {
    await expect(t.db.update(legalDocuments).set({ body: "changed" })).rejects.toThrow();
    await expect(t.db.delete(legalDocuments)).rejects.toThrow();
    // Clearing created_by (an account was deleted) is the one allowed update.
    await t.db.execute(sql`update legal_documents set created_by = null where kind = 'privacy'`);
  });
});
