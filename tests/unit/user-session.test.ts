import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as devLogin } from "@/app/api/dev-login/route";
import {
  UserAuthError,
  checkUser,
  devUserId,
  devUserSession,
  isTestEmail,
  runAsUser,
  type UserSession,
} from "@/server/auth/session-core";
import { payments, profiles, requests } from "@/server/db/schema";

import { createTestDb } from "../helpers/test-db";

const A = "a0000000-0000-4000-8000-00000000000a";
const B = "b0000000-0000-4000-8000-00000000000b";
const sessionOf = (userId: string, email = "zolb-test+a@example.com"): UserSession => ({
  userId,
  email,
  source: "supabase",
});

describe("development test login (devUserSession)", () => {
  const allowList = "zolb-test+a@example.com, zolb-test+b@example.com";
  it("works only in development, for an allowed test email", () => {
    const ok = { nodeEnv: "development", allowList, cookie: "zolb-test+a@example.com" };
    expect(devUserSession(ok)).toMatchObject({ email: "zolb-test+a@example.com", source: "dev" });
    expect(devUserSession({ ...ok, nodeEnv: "production" })).toBeNull();
    expect(devUserSession({ ...ok, nodeEnv: "test" })).toBeNull();
    expect(devUserSession({ ...ok, nodeEnv: undefined })).toBeNull();
  });
  it("refuses an email that is not in the list, or has no cookie", () => {
    expect(
      devUserSession({ nodeEnv: "development", allowList, cookie: "zolb-test+z@example.com" }),
    ).toBeNull();
    expect(devUserSession({ nodeEnv: "development", allowList })).toBeNull();
    expect(
      devUserSession({ nodeEnv: "development", cookie: "zolb-test+a@example.com" }),
    ).toBeNull();
  });
  it("refuses a real-looking email even if it is in the list", () => {
    const real = "maria@gmail.com";
    expect(devUserSession({ nodeEnv: "development", allowList: real, cookie: real })).toBeNull();
    expect(isTestEmail("zolb-test+a@example.com")).toBe(true);
    expect(isTestEmail("zolb-test+a@example.com.evil.com")).toBe(false);
    expect(isTestEmail("someone@example.com")).toBe(false);
  });
  it("gives the same id for the same email, in uuid form", () => {
    const id = devUserId("zolb-test+a@example.com");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(devUserId("ZOLB-test+a@example.com")).toBe(id);
    expect(devUserId("zolb-test+b@example.com")).not.toBe(id);
  });
});

describe("/api/dev-login route", () => {
  it("answers 404 outside development (so it cannot work on a real site)", () => {
    const response = devLogin(
      new NextRequest("http://localhost/api/dev-login?email=zolb-test%2Ba@example.com"),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("checkUser", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    t = await createTestDb();
  }, 60_000);
  afterAll(async () => t.close());

  it("refuses a visitor with no session", async () => {
    await expect(checkUser(t.db, null)).rejects.toMatchObject({ code: "no-session" });
    await expect(checkUser(t.db, null)).rejects.toBeInstanceOf(UserAuthError);
  });
  it("makes a missing profile as a plain user, never as admin", async () => {
    const profile = await checkUser(t.db, sessionOf(A));
    expect(profile.id).toBe(A);
    expect(profile.role).toBe("user");
  });
  it("keeps the role from the profiles table, not from the session", async () => {
    await t.db.insert(profiles).values({ id: B, email: "zolb-test+b@example.com", role: "admin" });
    expect((await checkUser(t.db, sessionOf(B, "zolb-test+b@example.com"))).role).toBe("admin");
    expect((await checkUser(t.db, sessionOf(A))).role).toBe("user");
  });
  it("refuses when the email is not verified and verification is needed", async () => {
    await expect(checkUser(t.db, sessionOf(A), { emailVerified: false })).rejects.toMatchObject({
      code: "not-verified",
    });
  });
});

describe("runAsUser (Row Level Security through Drizzle)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    t = await createTestDb({ supabase: true });
    await t.pg.exec(`
      insert into auth.users (id, email) values
        ('${A}', 'zolb-test+a@example.com'), ('${B}', 'zolb-test+b@example.com');
      insert into services (slug, name) values ('svc', 'Sample service');
    `);
    const service = (await t.pg.query<{ id: string }>(`select id from services`)).rows[0].id;
    for (const [user, code] of [
      [A, "RG-AAAAAAAA"],
      [B, "RG-BBBBBBBB"],
    ]) {
      await t.pg.query(
        `insert into requests (tracking_code, service_id, user_id, client_full_name, client_email,
           client_phone, client_phone_last4, consent_version, consent_at)
         values ($1, $2, $3, 'Test Client', 'zolb-test+c@example.com', '+639000000000', '0000', 'v1', now())`,
        [code, service, user],
      );
    }
  }, 60_000);
  afterAll(async () => t.close());

  it("returns only the rows of the user, with Drizzle and an explicit column list", async () => {
    const rows = await runAsUser(t.db, A, (tx) =>
      tx.select({ code: requests.trackingCode, owner: requests.userId }).from(requests),
    );
    expect(rows).toEqual([{ code: "RG-AAAAAAAA", owner: A }]);
  });
  it("shows nothing for a user id that owns nothing", async () => {
    const rows = await runAsUser(t.db, "f0000000-0000-4000-8000-00000000000f", (tx) =>
      tx.select({ code: requests.trackingCode }).from(requests),
    );
    expect(rows).toEqual([]);
  });
  it("cannot read private columns or write", async () => {
    await expect(
      runAsUser(t.db, A, (tx) => tx.select({ hash: requests.draftTokenHash }).from(requests)),
    ).rejects.toThrow();
    await expect(
      runAsUser(t.db, A, (tx) => tx.update(requests).set({ status: "completed" })),
    ).rejects.toThrow();
    await expect(
      runAsUser(t.db, A, (tx) => tx.update(payments).set({ status: "verified" })),
    ).rejects.toThrow();
  });
  it("goes back to the normal role after the transaction (the next query is not limited)", async () => {
    await runAsUser(t.db, A, (tx) => tx.select({ id: requests.id }).from(requests));
    const all = await t.db.select({ id: requests.id }).from(requests);
    expect(all).toHaveLength(2);
  });
});
