// A safety net for the sign-in Server Actions (src/app/auth/actions.ts). It reads the source and checks that
// every form that anyone on the internet can send has a rate limit and a Turnstile check, and that nothing
// says whether an email has an account. A new action that forgets this makes the test fail.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "../../src/app/auth/actions.ts"), "utf8");

function body(name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const next = source.indexOf("\nexport async function ", start + 10);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("public sign-in actions", () => {
  for (const name of [
    "loginAction",
    "registerAction",
    "resendVerificationAction",
    "forgotPasswordAction",
  ]) {
    it(`${name} has a rate limit and a Turnstile check`, () => {
      const text = body(name);
      expect(text).toContain("overLimit(");
      expect(text).toContain("turnstileOk(");
    });
    it(`${name} checks the values before it uses up the Turnstile token`, () => {
      const text = body(name);
      expect(text.indexOf("safeParse(")).toBeGreaterThan(-1);
      expect(text.indexOf("safeParse(")).toBeLessThan(text.indexOf("turnstileOk("));
    });
  }

  it("resetPasswordAction needs a login session first", () => {
    expect(body("resetPasswordAction")).toContain("getSession()");
  });

  it("login gives one message for a wrong email and a wrong password", () => {
    const text = body("loginAction");
    expect(text).toContain("GENERIC_LOGIN_ERROR");
    expect(text).not.toMatch(/user not found|no account|does not exist/i);
  });

  it("sign up, resend and forgot password never say whether an email is known", () => {
    for (const name of ["registerAction", "resendVerificationAction", "forgotPasswordAction"]) {
      expect(body(name), name).not.toMatch(
        /already (registered|exists|has an account)|no account/i,
      );
    }
  });

  it("sign out is a Server Action that clears the session on the server", () => {
    const text = body("signOutAction");
    expect(text).toContain("auth.signOut()");
    expect(text).toContain('redirect("/?signed_out=1")');
  });

  it("the file is a use server file and never reads the role from the browser", () => {
    expect(source.trimStart().startsWith('"use server"')).toBe(true);
    expect(source).not.toMatch(/formData\.get\(["']role["']\)/);
  });
});
