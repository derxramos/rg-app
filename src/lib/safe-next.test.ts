import { describe, expect, it } from "vitest";

import { landingPathFor, loginUrlFor, safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps normal paths on this site, with query and hash", () => {
    expect(safeNextPath("/account")).toBe("/account");
    expect(safeNextPath("/request/abc/payment?x=1#top")).toBe("/request/abc/payment?x=1#top");
  });
  it("uses the fallback for nothing or empty", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null, "/account")).toBe("/account");
    expect(safeNextPath("", "/account")).toBe("/account");
  });
  it("refuses other websites and tricks", () => {
    for (const bad of [
      "https://evil.example.com",
      "http://evil.example.com/x",
      "//evil.example.com",
      "/\\evil.example.com",
      "javascript:alert(1)",
      "account",
      "/ok\nSet-Cookie: x=1",
      "/ok\u0000",
    ]) {
      expect(safeNextPath(bad, "/safe"), bad).toBe("/safe");
    }
  });
  it("refuses a very long path", () => {
    expect(safeNextPath("/" + "a".repeat(400), "/safe")).toBe("/safe");
  });
  it("never sends people back to a login page (no loop)", () => {
    for (const path of [
      "/login",
      "/login?next=/x",
      "/register",
      "/forgot-password",
      "/auth/confirm",
    ]) {
      expect(safeNextPath(path, "/safe"), path).toBe("/safe");
    }
  });
});

describe("landingPathFor", () => {
  it("sends admins to /admin and users to /account", () => {
    expect(landingPathFor("admin")).toBe("/admin");
    expect(landingPathFor("user")).toBe("/account");
  });
});

describe("loginUrlFor", () => {
  it("adds the return path and the expired message", () => {
    expect(loginUrlFor("/account/requests/1")).toBe("/login?next=%2Faccount%2Frequests%2F1");
    expect(loginUrlFor("/account", { expired: true })).toBe(
      "/login?next=%2Faccount&reason=expired",
    );
  });
  it("drops an unsafe return path", () => {
    expect(loginUrlFor("//evil.example.com")).toBe("/login");
  });
});
