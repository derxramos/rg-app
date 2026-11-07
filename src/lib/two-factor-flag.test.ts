import { describe, expect, it } from "vitest";

import { isTwoFactorRequired } from "./two-factor-flag";

describe("isTwoFactorRequired (ADMIN_REQUIRE_2FA)", () => {
  it("is required when the variable is missing", () => {
    expect(isTwoFactorRequired(undefined)).toBe(true);
  });
  it("is required when it is empty or only spaces", () => {
    expect(isTwoFactorRequired("")).toBe(true);
    expect(isTwoFactorRequired("   ")).toBe(true);
  });
  it('is required when it is "true"', () => {
    expect(isTwoFactorRequired("true")).toBe(true);
  });
  it('is OFF only for the exact word "false" (spaces and capitals ignored)', () => {
    expect(isTwoFactorRequired("false")).toBe(false);
    expect(isTwoFactorRequired("  FALSE ")).toBe(false);
    expect(isTwoFactorRequired("False")).toBe(false);
  });
  it('is required for "0", "no", "off" and any other value', () => {
    for (const value of ["0", "no", "off", "disabled", "falsee", "f"]) {
      expect(isTwoFactorRequired(value), value).toBe(true);
    }
  });
});
