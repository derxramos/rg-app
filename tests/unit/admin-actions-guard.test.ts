// A safety net for CLAUDE.md rule 5: "Every server action and route checks access first."
// It reads the source files and checks that every exported Server Action in the protected admin area
// goes through withPanel() / requirePanel(), and every admin API route calls requirePanel().
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
      it(`${rel}: ${fn.name}() calls withPanel or requirePanel`, () => {
        expect(/withPanel\(|requirePanel\(/.test(fn.body)).toBe(true);
      });
    }
  }

  for (const file of adminRoutes) {
    it(`${path.relative(ROOT, file)} calls requirePanel`, () => {
      expect(readFileSync(file, "utf8")).toContain("requirePanel(");
    });
  }

  it("every withPanel call names its action from the role table (src/lib/permissions.ts)", () => {
    for (const file of protectedActions) {
      const source = readFileSync(file, "utf8");
      for (const call of source.matchAll(/withPanel\(\s*\{([^}]*)\}/g)) {
        expect(call[1], `${path.relative(ROOT, file)}`).toMatch(/\baction\s*[:,]/);
      }
    }
  });

  it("the payment method and account actions use their own permission names", () => {
    const expected: Record<string, RegExp> = {
      "app/admin/(protected)/settings/payments/actions.ts": /payment_methods.manage/,
      "app/admin/(protected)/settings/users/actions.ts": /accounts./,
    };
    for (const [rel, pattern] of Object.entries(expected)) {
      const source = readFileSync(path.join(ROOT, rel), "utf8");
      for (const fn of exportedFunctions(source))
        expect(fn.body, `${rel} ${fn.name}`).toMatch(pattern);
    }
  });

  it("no code still uses the old role lists (OWNER_ONLY, hasRole, PAYMENT_VERIFY_ROLES)", () => {
    for (const file of walk(ROOT).filter((f) => /.(ts|tsx)$/.test(f))) {
      const text = readFileSync(file, "utf8");
      // The table itself keeps a private list with a similar name.
      if (file.endsWith(path.join("lib", "permissions.ts"))) continue;
      expect(text, path.relative(ROOT, file)).not.toMatch(
        /OWNER_ONLY|hasRole|PAYMENT_VERIFY_ROLES|adminProfiles/,
      );
    }
  });

  it("the development bypass is only read in panel.ts, and only with a development check", () => {
    const offenders = walk(ROOT).filter(
      (f) => /\.(ts|tsx)$/.test(f) && readFileSync(f, "utf8").includes("DEV_ADMIN_BYPASS_EMAIL"),
    );
    const rels = offenders.map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
    // Allowed: the session code, a comment in the core, and a comment in the development route.
    expect(rels.sort()).toEqual([
      "app/api/dev-login/route.ts",
      "server/auth/panel-core.ts",
      "server/auth/panel.ts",
      "server/auth/session.ts",
    ]);
  });
});

// ---------- The user area (logged-in people) ----------
// Every Server Action in /account must check the login first. A page check is not enough, because a
// Server Action can be called with a direct POST request. (The folder may not exist yet in early phases.)
const USER_GUARD = /withUser\(|requireUser\(|requireVerifiedUser\(|requireRequestAccess\(/;
const accountDir = path.join(ROOT, "app/(public)/account");
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

  it("every route under /api/account checks the login first and only answers POST", () => {
    const routes = walk(path.join(ROOT, "app/api/account")).filter((f) => f.endsWith("route.ts"));
    expect(routes.length).toBeGreaterThanOrEqual(2);
    for (const file of routes) {
      const text = readFileSync(file, "utf8");
      const rel = path.relative(ROOT, file);
      expect(text, rel).toMatch(/requireUser\(|requireVerifiedUser\(/);
      expect(text, rel).toContain("export async function POST(");
      expect(text, rel).not.toMatch(/export (async )?function GET\(/);
    }
  });

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
