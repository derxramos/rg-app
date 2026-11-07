// A safety net for CLAUDE.md rule 5: "Every server action and route checks access first."
// It reads the source files and checks that every exported Server Action in the protected admin area
// goes through withAdmin() / requireAdmin(), and every admin API route calls requireAdmin().
// A new action that forgets the check makes this test fail.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// Splits a file into its exported async functions (name and body).
function exportedFunctions(source: string): { name: string; body: string }[] {
  const parts = source.split(/\nexport async function /).slice(1);
  return parts.map((part) => ({ name: part.slice(0, part.indexOf("(")), body: part }));
}

const protectedActions = walk(path.join(ROOT, "app/admin/(protected)")).filter((f) =>
  f.endsWith("actions.ts"),
);
const adminRoutes = walk(path.join(ROOT, "app/api/admin")).filter((f) => f.endsWith("route.ts"));

describe("admin actions and routes check access first", () => {
  it("finds the action files (so this test cannot pass by finding nothing)", () => {
    expect(protectedActions.length).toBeGreaterThanOrEqual(4);
    expect(adminRoutes.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of protectedActions) {
    const rel = path.relative(ROOT, file);
    const source = readFileSync(file, "utf8");
    it(`${rel} is a "use server" file`, () => {
      expect(source.trimStart().startsWith('"use server"')).toBe(true);
    });
    for (const fn of exportedFunctions(source)) {
      it(`${rel}: ${fn.name}() calls withAdmin or requireAdmin`, () => {
        expect(/withAdmin\(|requireAdmin\(/.test(fn.body)).toBe(true);
      });
    }
  }

  for (const file of adminRoutes) {
    it(`${path.relative(ROOT, file)} calls requireAdmin`, () => {
      expect(readFileSync(file, "utf8")).toContain("requireAdmin(");
    });
  }

  it("owner-only actions say so (roles: OWNER_ONLY)", () => {
    for (const rel of [
      "app/admin/(protected)/settings/payments/actions.ts",
      "app/admin/(protected)/settings/users/actions.ts",
    ]) {
      const source = readFileSync(path.join(ROOT, rel), "utf8");
      for (const fn of exportedFunctions(source))
        expect(fn.body, `${rel} ${fn.name}`).toContain("OWNER_ONLY");
    }
  });

  it("the development bypass is only read in admin.ts, and only with a development check", () => {
    const offenders = walk(ROOT).filter(
      (f) => /\.(ts|tsx)$/.test(f) && readFileSync(f, "utf8").includes("DEV_ADMIN_BYPASS_EMAIL"),
    );
    const rels = offenders.map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
    // Allowed: the session code and a comment in the core.
    expect(rels.sort()).toEqual([
      "server/auth/admin-core.ts",
      "server/auth/admin.ts",
      "server/auth/session.ts",
    ]);
  });
});

// ---------- The user area (logged-in people) ----------
// Every Server Action in /account must check the login first. A page check is not enough, because a
// Server Action can be called with a direct POST request. (The folder may not exist yet in early phases.)
const USER_GUARD = /withUser\(|requireUser\(|requireVerifiedUser\(|requireRequestAccess\(/;
const accountDir = path.join(ROOT, "app/account");
const accountActions = (() => {
  try {
    return walk(accountDir).filter((f) => /actions\.ts$/.test(f));
  } catch {
    return [];
  }
})();

describe("user actions check the login first", () => {
  for (const file of accountActions) {
    const rel = path.relative(ROOT, file);
    const source = readFileSync(file, "utf8");
    it(`${rel} is a "use server" file`, () => {
      expect(source.trimStart().startsWith('"use server"')).toBe(true);
    });
    for (const fn of exportedFunctions(source)) {
      it(`${rel}: ${fn.name}() calls withUser / requireUser / requireVerifiedUser`, () => {
        expect(USER_GUARD.test(fn.body)).toBe(true);
      });
    }
  }

  it("the development test login route answers 404 unless NODE_ENV is development", () => {
    const source = readFileSync(path.join(ROOT, "app/api/dev-login/route.ts"), "utf8");
    expect(source).toContain('process.env.NODE_ENV !== "development"');
    expect(source.indexOf('NODE_ENV !== "development"')).toBeLessThan(
      source.indexOf("cookies.set"),
    );
  });

  it("the development test user is only read in session.ts and the dev route", () => {
    const offenders = walk(ROOT)
      .filter(
        (f) => /\.(ts|tsx)$/.test(f) && readFileSync(f, "utf8").includes("DEV_USER_BYPASS_EMAILS"),
      )
      .map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
    // Allowed: the session code, a comment in the core, the development route, and the login page that lists the test users.
    expect(offenders.sort()).toEqual([
      "app/(public)/login/page.tsx",
      "app/api/dev-login/route.ts",
      "server/auth/session-core.ts",
      "server/auth/session.ts",
    ]);
  });
});
