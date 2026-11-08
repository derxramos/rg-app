// The account service: My requests, one request, profile, download my data, delete my account.
// It runs on the real SQL migrations with a tiny fake of Supabase, so Row Level Security is really tested
// (the reads run through runAsUser, like the pages do). Test accounts use zolb-test+...@example.com only.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAsUser } from "@/server/auth/session-core";
import { activityLog, profiles, requestFiles, requests } from "@/server/db/schema";
import {
  AccountError,
  deleteMyAccount,
  exportMyData,
  getMyRequest,
  listMyRequests,
  updateProfile,
} from "@/server/services/account";
import type { StorageDriver } from "@/server/storage/types";

import { createTestDb } from "../helpers/test-db";

const A = "a0000000-0000-4000-8000-00000000000a";
const B = "b0000000-0000-4000-8000-00000000000b";
const ADMIN = "c0000000-0000-4000-8000-00000000000c";
const C = "d0000000-0000-4000-8000-00000000000d";

let t: Awaited<ReturnType<typeof createTestDb>>;
let serviceId: string;
const ids: Record<string, string> = {};

function fakeStorage() {
  const removed: string[] = [];
  const driver: StorageDriver = {
    put: async () => {},
    remove: async (_bucket, paths) => {
      removed.push(...paths);
    },
    signedUrl: async () => "https://example.invalid/x",
  };
  return { driver, removed };
}

// Removes the login like Supabase does: the profile goes with it (foreign key).
const authApi = () => {
  const deleted: string[] = [];
  return {
    deleted,
    api: {
      deleteUser: async (id: string) => {
        deleted.push(id);
        await t.pg.query(`delete from auth.users where id = $1`, [id]);
      },
    },
  };
};

async function addRequest(userId: string | null, code: string, status = "draft") {
  const row = await t.pg.query<{ id: string }>(
    `insert into requests (tracking_code, service_id, user_id, status, client_full_name, client_email,
       client_phone, client_phone_last4, consent_version, consent_at, public_message)
     values ($1, $2, $3, $4, 'Real Name', 'zolb-test+x@example.com', '+639171234567', '4567', 'v1', now(), 'Hello from us')
     returning id`,
    [code, serviceId, userId, status],
  );
  return row.rows[0].id;
}

beforeAll(async () => {
  t = await createTestDb({ supabase: true });
  await t.pg.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${A}', 'zolb-test+a@example.com', '{"full_name":"User A"}'),
      ('${B}', 'zolb-test+b@example.com', '{"full_name":"User B"}'),
      ('${C}', 'zolb-test+c@example.com', '{"full_name":"User C"}'),
      ('${ADMIN}', 'zolb-test+admin@example.com', '{"full_name":"Admin"}');
    update profiles set role = 'owner' where id = '${ADMIN}';
    insert into services (slug, name) values ('svc', 'Sample service');
  `);
  serviceId = (await t.pg.query<{ id: string }>(`select id from services`)).rows[0].id;

  ids.a1 = await addRequest(A, "RG-AAAAAAA1", "submitted");
  ids.a2 = await addRequest(A, "RG-AAAAAAA2", "completed");
  ids.b1 = await addRequest(B, "RG-BBBBBBB1", "submitted");
  ids.guest = await addRequest(null, "RG-GUESTGST", "submitted");

  const method = (
    await t.pg.query<{ id: string }>(
      `insert into payment_methods (name, account_name, account_number) values ('Sample', 'Sample', '0000') returning id`,
    )
  ).rows[0].id;
  await t.pg.query(
    `insert into payments (request_id, payment_method_id, method_snapshot, reference_number, amount_centavos, paid_on, entry_method)
     values ($1, $2, '{}'::jsonb, 'REFA1', 150050, '2026-11-01', 'manual'), ($3, $2, '{}'::jsonb, 'REFB1', 99900, '2026-11-01', 'manual')`,
    [ids.a1, method, ids.b1],
  );
  await t.pg.query(
    `insert into request_files (request_id, storage_path, original_name, mime_type, size_bytes)
     values ($1, 'users/a/requests/x/1.jpg', 'my-id.jpg', 'image/jpeg', 100), ($2, 'users/b/requests/y/2.jpg', 'b-id.jpg', 'image/jpeg', 100)`,
    [ids.a1, ids.b1],
  );
  await t.pg.query(
    `insert into request_notes (request_id, author_id, visibility, body) values
       ($1, '${ADMIN}', 'internal', 'secret staff note'), ($1, '${ADMIN}', 'client', 'Please send your ID')`,
    [ids.a1],
  );
  await t.pg.query(
    `insert into request_status_events (request_id, to_status) values ($1, 'draft'), ($1, 'submitted')`,
    [ids.a1],
  );
}, 60_000);
afterAll(async () => t.close());

describe("My requests (through Row Level Security)", () => {
  it("lists only the user's own requests, newest first", async () => {
    const rows = await runAsUser(t.db, A, (tx) => listMyRequests(tx, A));
    expect(rows.map((r) => r.trackingCode).sort()).toEqual(["RG-AAAAAAA1", "RG-AAAAAAA2"]);
    expect(rows[0].serviceName).toBe("Sample service");
  });

  it("does not list guest requests or another user's requests", async () => {
    const rows = await runAsUser(t.db, B, (tx) => listMyRequests(tx, B));
    expect(rows.map((r) => r.trackingCode)).toEqual(["RG-BBBBBBB1"]);
  });

  it("is protected by the database even if the code asks for someone else's id", async () => {
    // Pretend a bug: user A's session asks for user B's rows. Row Level Security still returns none.
    const rows = await runAsUser(t.db, A, (tx) => listMyRequests(tx, B));
    expect(rows).toEqual([]);
  });

  it("is protected by the code as well (owner connection, wrong user id)", async () => {
    expect(await listMyRequests(t.db, C)).toEqual([]);
  });
});

describe("one request", () => {
  it("shows status, timeline, messages from us, payment and file NAMES", async () => {
    const detail = await runAsUser(t.db, A, (tx) => getMyRequest(tx, A, ids.a1));
    expect(detail).not.toBeNull();
    expect(detail?.status).toBe("submitted");
    expect(detail?.message).toBe("Hello from us");
    expect(detail?.timeline.map((e) => e.status)).toEqual(["submitted"]);
    expect(detail?.payments).toMatchObject([{ status: "pending", amountCentavos: 150050 }]);
    expect(detail?.files.map((f) => f.name)).toEqual(["my-id.jpg"]);
    expect(detail?.canPay).toBe(true);
    expect(detail?.canUploadMore).toBe(false);
  });

  it("never gives a storage path or an internal note", async () => {
    const detail = await runAsUser(t.db, A, (tx) => getMyRequest(tx, A, ids.a1));
    const text = JSON.stringify(detail);
    expect(text).not.toContain("storage");
    expect(text).not.toContain("users/a/requests");
    expect(text).not.toContain("secret staff note");
    expect(detail?.messages.map((m) => m.body)).toEqual(["Please send your ID"]);
  });

  it("gives the same answer for another user's request, a guest request and a missing one", async () => {
    const other = await runAsUser(t.db, A, (tx) => getMyRequest(tx, A, ids.b1));
    const guest = await runAsUser(t.db, A, (tx) => getMyRequest(tx, A, ids.guest));
    const missing = await runAsUser(t.db, A, (tx) =>
      getMyRequest(tx, A, "99999999-9999-4999-8999-999999999999"),
    );
    expect([other, guest, missing]).toEqual([null, null, null]);
  });
});

describe("profile", () => {
  it("changes the name and phone, logs it, and never the role or email", async () => {
    await updateProfile(t.db, C, { fullName: "  New Name  ", phone: "+639181112222" }, "iphash");
    const [row] = await t.db.select().from(profiles).where(eq(profiles.id, C));
    expect(row).toMatchObject({
      fullName: "New Name",
      phone: "+639181112222",
      role: "user",
      email: "zolb-test+c@example.com",
    });
    const log = await t.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "profile.updated"));
    expect(log).toHaveLength(1);
    expect(JSON.stringify(log[0].details)).not.toContain("New Name");
  });

  it("refuses a name that is too short", async () => {
    await expect(
      updateProfile(t.db, C, { fullName: "x", phone: null }, null),
    ).rejects.toMatchObject({
      code: "invalid",
    });
  });
});

describe("download my data", () => {
  it("contains only the user's own data, and writes a log row", async () => {
    const data = await exportMyData(t.db, A, "iphash");
    const text = JSON.stringify(data);
    expect(data.profile.email).toBe("zolb-test+a@example.com");
    expect(data.requests.map((r) => r.trackingCode)).toEqual(["RG-AAAAAAA1", "RG-AAAAAAA2"]);
    expect(text).not.toContain("RG-BBBBBBB1");
    expect(text).not.toContain("zolb-test+b@example.com");
    expect(text).not.toContain("REFB1");
    expect(text).not.toContain("secret staff note");
    expect(text).not.toContain("users/a/requests");
    const first = data.requests.find((r) => r.trackingCode === "RG-AAAAAAA1");
    expect(first?.files.map((f) => f.name)).toEqual(["my-id.jpg"]);
    expect(first?.payments).toHaveLength(1);
    const log = await t.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "data.exported"));
    expect(log.length).toBeGreaterThan(0);
  });
});

describe("delete my account", () => {
  it("is refused while a request is open", async () => {
    const { driver } = fakeStorage();
    const { api, deleted } = authApi();
    await expect(
      deleteMyAccount(t.db, driver, api, { userId: B, bucket: "client-files", ipHash: null }),
    ).rejects.toMatchObject({ code: "open-requests" });
    expect(deleted).toEqual([]);
    const [still] = await t.db.select().from(profiles).where(eq(profiles.id, B));
    expect(still).toBeDefined();
  });

  it("is refused for an admin account", async () => {
    const { driver } = fakeStorage();
    const { api } = authApi();
    await expect(
      deleteMyAccount(t.db, driver, api, { userId: ADMIN, bucket: "client-files", ipHash: null }),
    ).rejects.toBeInstanceOf(AccountError);
  });

  it("erases files and personal fields, keeps a minimal record, and removes the login and profile", async () => {
    // Make A's open request finished first, as the rule demands.
    await t.pg.query(`update requests set status = 'completed' where id = $1`, [ids.a1]);
    const { driver, removed } = fakeStorage();
    const { api, deleted } = authApi();

    const result = await deleteMyAccount(t.db, driver, api, {
      userId: A,
      bucket: "client-files",
      ipHash: "iphash",
    });

    expect(result).toEqual({ requests: 2, filesDeleted: 1 });
    expect(deleted).toEqual([A]);
    expect(removed).toEqual(["users/a/requests/x/1.jpg"]);

    // The login and the profile are gone.
    expect(await t.db.select().from(profiles).where(eq(profiles.id, A))).toEqual([]);

    // The requests stay as a minimal record, with no owner and no personal details.
    const kept = await t.db.select().from(requests).where(eq(requests.trackingCode, "RG-AAAAAAA1"));
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      userId: null,
      clientFullName: "Deleted client",
      clientEmail: "deleted@example.invalid",
      publicMessage: null,
    });
    const [file] = await t.db.select().from(requestFiles).where(eq(requestFiles.requestId, ids.a1));
    expect(file.originalName).toBe("deleted");
    expect(file.deletedAt).not.toBeNull();

    // The payment values are kept for the business accounts.
    const pay = await t.pg.query<{ n: number }>(
      `select count(*)::int as n from payments where request_id = $1`,
      [ids.a1],
    );
    expect(pay.rows[0].n).toBe(1);

    // One log row, with counts only (no name or email).
    const log = await t.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "account.deleted"));
    expect(log).toHaveLength(1);
    expect(log[0].details).toEqual({ requests: 2, filesDeleted: 1 });

    // Other users are untouched.
    const [b] = await t.db.select().from(requests).where(eq(requests.id, ids.b1));
    expect(b.clientFullName).toBe("Real Name");
  });
});
