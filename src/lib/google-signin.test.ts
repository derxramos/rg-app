import { describe, expect, it } from "vitest";

import {
  classifyGoogleReturn,
  googleCallbackUrl,
  googleLanding,
  isGoogleSignInEnabled,
} from "./google-signin";

describe("isGoogleSignInEnabled", () => {
  it("is on only for the word true", () => {
    expect(isGoogleSignInEnabled("true")).toBe(true);
    expect(isGoogleSignInEnabled(" TRUE ")).toBe(true);
    for (const off of [undefined, "", "false", "1", "yes"])
      expect(isGoogleSignInEnabled(off)).toBe(false);
  });
});

describe("googleLanding", () => {
  it("sends a user to a safe next path or to the account page", () => {
    expect(googleLanding("user", "/request?service=a")).toEqual({
      ok: true,
      path: "/request?service=a",
    });
    expect(googleLanding("user", null)).toEqual({ ok: true, path: "/account" });
    expect(googleLanding("user", "//evil.com")).toEqual({ ok: true, path: "/account" });
    expect(googleLanding("user", "https://evil.com")).toEqual({ ok: true, path: "/account" });
  });

  it("never lets an admin in with Google", () => {
    expect(googleLanding("admin", "/admin")).toEqual({ ok: false, reason: "admin" });
  });
});

describe("googleCallbackUrl", () => {
  it("adds only a safe next path", () => {
    expect(googleCallbackUrl("https://x.com", "/request")).toBe(
      "https://x.com/auth/callback?next=%2Frequest",
    );
    expect(googleCallbackUrl("https://x.com", "//evil.com")).toBe("https://x.com/auth/callback");
    expect(googleCallbackUrl("https://x.com", undefined)).toBe("https://x.com/auth/callback");
  });
});

describe("classifyGoogleReturn", () => {
  const classify = (query: string) => classifyGoogleReturn(new URLSearchParams(query));

  it("calls only a real No on the Google screen cancelled", () => {
    expect(classify("error=access_denied&error_description=The+user+denied")).toEqual({
      reason: "google-cancelled",
      detail: "access_denied",
    });
  });

  it("keeps the reason code for every other error", () => {
    expect(
      classify("error=server_error&error_code=unexpected_failure&error_description=x"),
    ).toEqual({
      reason: "google-failed",
      detail: "unexpected_failure",
    });
    expect(classify("error=server_error").detail).toBe("server_error");
  });

  it("cleans the code so only safe characters stay", () => {
    expect(classify("error=x&error_code=%3Cscript%3E_Bad Code!").detail).toBe("script_badcode");
  });

  it("says no_code when there is no error and no code", () => {
    expect(classify("")).toEqual({ reason: "google-failed", detail: "no_code" });
  });
});
