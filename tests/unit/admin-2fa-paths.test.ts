// Admin 2-step login (ADMIN_REQUIRE_2FA) in BOTH states. When it is "false" (off) and when it is required.
// The flag only skips the 2FA code step. It must never skip a role check, and users are never asked for a code.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isTwoFactorRequired } from "@/lib/two-factor-flag";
import {
  panelFailureRedirect,
  afterLoginDestination,
  checkPanel,
  type PanelAuthCode,
  type PanelSession,
} from "@/server/auth/panel-core";
import { profiles } from "@/server/db/schema";

import { createTestDb } from "../helpers/test-db";

const ADMIN = "a0000000-0000-4000-8000-0000000000a1";
const USER = "b0000000-0000-4000-8000-0000000000b1";
const MISMATCH = "c0000000-0000-4000-8000-0000000000c1";
const NOBODY = "d0000000-0000-4000-8000-0000000000d1";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(profiles).values([
    { id: ADMIN, email: "zolb-test+a@example.com", role: "owner" },
    { id: USER, email: "zolb-test+u@example.com", role: "user" },
    { id: MISMATCH, email: "zolb-test+m@example.com", role: "user" },
  ]);
}, 60_000);
afterAll(async () => t.close());

const session = (userId: string, aal: PanelSession["aal"]): PanelSession => ({
  userId,
  email: "zolb-test+x@example.com",
  aal,
});
const result = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e) => (e as { code?: string }).code ?? String(e),
  );

// Both settings, read the same way the app reads them.
const SETTINGS = [
  { name: "ADMIN_REQUIRE_2FA=false", value: "false", required: false },
  { name: "ADMIN_REQUIRE_2FA=true", value: "true", required: true },
  { name: "ADMIN_REQUIRE_2FA missing", value: undefined, required: true },
] as const;

describe.each(SETTINGS)("$name", ({ value, required }) => {
  const twoFactorRequired = isTwoFactorRequired(value);

  it("is read as expected", () => {
    expect(twoFactorRequired).toBe(required);
  });

  it("an admin with only a password: in when off, asked for 2FA when required", async () => {
    const expected = required ? "needs-2fa" : "ok";
    expect(await result(checkPanel(t.db, session(ADMIN, "aal1"), { twoFactorRequired }))).toBe(
      expected,
    );
  });

  it("an admin with password and code is always in", async () => {
    expect(await result(checkPanel(t.db, session(ADMIN, "aal2"), { twoFactorRequired }))).toBe(
      "ok",
    );
  });

  it("NEVER skips a role check (user role, mismatch, stranger, no session)", async () => {
    for (const aal of ["aal1", "aal2"] as const) {
      // With 2FA required, a password-only session is stopped at the 2FA step first. Either way it is refused.
      const expected = required && aal === "aal1" ? "needs-2fa" : "not-admin";
      for (const id of [USER, MISMATCH, NOBODY]) {
        expect(await result(checkPanel(t.db, session(id, aal), { twoFactorRequired })), id).toBe(
          expected,
        );
      }
    }
    expect(await result(checkPanel(t.db, null, { twoFactorRequired }))).toBe("no-session");
  });

  it("after the password: users are never sent to 2FA", () => {
    expect(
      afterLoginDestination({
        role: "user",
        isActive: true,
        twoFactorRequired,
        hasVerifiedFactor: true,
        next: null,
      }),
    ).toBe("/account");
    expect(
      afterLoginDestination({
        role: "user",
        isActive: true,
        twoFactorRequired,
        hasVerifiedFactor: false,
        next: "/request",
      }),
    ).toBe("/request");
  });

  it("after the password: an admin goes straight in when off, to the 2FA steps when required", () => {
    const noApp = afterLoginDestination({
      role: "owner",
      isActive: true,
      twoFactorRequired,
      hasVerifiedFactor: false,
      next: null,
    });
    const withApp = afterLoginDestination({
      role: "owner",
      isActive: true,
      twoFactorRequired,
      hasVerifiedFactor: true,
      next: null,
    });
    expect(noApp).toBe(required ? "/admin/mfa/setup" : "/admin");
    expect(withApp).toBe(required ? "/admin/mfa" : "/admin");
  });
});

describe("where people are sent", () => {
  it("maps every admin failure to a page", () => {
    const expected: Record<PanelAuthCode, string> = {
      "no-session": "/login?next=%2Fadmin&reason=expired",
      "needs-2fa": "/admin/mfa",
      "needs-fresh-2fa": "/admin/mfa",
      "wrong-role": "/admin/not-allowed?reason=role",
      "needs-mfa-setup": "/admin/mfa/setup",
      "session-revoked": "/login?next=%2Fadmin&reason=expired",
      "not-admin": "/admin/not-allowed",
      inactive: "/admin/not-allowed",
      "must-change-password": "/account/change-password",
    };
    for (const [code, path] of Object.entries(expected)) {
      expect(panelFailureRedirect(code as PanelAuthCode), code).toBe(path);
    }
  });

  it("a safe return path is used for users and for admins when 2FA is off", () => {
    const base = { twoFactorRequired: false, hasVerifiedFactor: false } as const;
    expect(
      afterLoginDestination({ ...base, role: "owner", isActive: true, next: "/admin/requests" }),
    ).toBe("/admin/requests");
    expect(
      afterLoginDestination({ ...base, role: "user", isActive: true, next: "//evil.example.com" }),
    ).toBe("/account");
  });
});

// ---------- The flag stays on the server ----------
const SRC = path.resolve(__dirname, "../../src");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));

describe("the flag is server only", () => {
  it("has no NEXT_PUBLIC_ name anywhere (code, .env.example)", () => {
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/NEXT_PUBLIC_[A-Z_]*2FA/);
    }
    const example = readFileSync(path.resolve(__dirname, "../../.env.example"), "utf8");
    expect(example).not.toMatch(/NEXT_PUBLIC_[A-Z_]*2FA/);
    expect(example).toMatch(/^ADMIN_REQUIRE_2FA=/m);
  });

  it("is read only in server files (never in a client component)", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("ADMIN_REQUIRE_2FA")) continue;
      expect(text.trimStart().startsWith('"use client"'), file).toBe(false);
    }
  });

  it("is always read through isTwoFactorRequired (one rule)", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (/process\.env\.ADMIN_REQUIRE_2FA/.test(text)) {
        expect(text, file).toContain("isTwoFactorRequired(");
      }
    }
  });
});

describe("the 2FA pages and actions are for admins only", () => {
  const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");
  it("the code and setup pages use guardMfaPage", () => {
    expect(read("app/admin/(auth)/mfa/page.tsx")).toContain("guardMfaPage()");
    expect(read("app/admin/(auth)/mfa/setup/page.tsx")).toContain("guardMfaPage()");
  });
  it("every 2FA action checks the person is an admin first", () => {
    const source = read("app/admin/(auth)/actions.ts");
    const parts = source.split(/\nexport async function /).slice(1);
    expect(parts.length).toBe(3);
    for (const part of parts) expect(part, part.slice(0, 30)).toContain("adminPending()");
  });
});
