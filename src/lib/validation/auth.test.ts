import { describe, expect, it } from "vitest";

import {
  fieldErrors,
  loginSchema,
  passwordProblem,
  registerSchema,
  resetPasswordSchema,
} from "./auth";

const good = {
  fullName: "Test Client",
  email: "zolb-test+a@example.com",
  password: "correct horse battery",
  confirmPassword: "correct horse battery",
  consent: "on",
};

describe("passwordProblem", () => {
  it("accepts a long phrase", () => {
    expect(passwordProblem("correct horse battery")).toBeNull();
  });
  it("needs at least 12 characters", () => {
    expect(passwordProblem("short1")).toMatch(/at least 12/);
    expect(passwordProblem("a1b2c3d4e5f")).toMatch(/at least 12/);
    expect(passwordProblem("a1b2c3d4e5f6")).toBeNull();
  });
  it("allows at most 72 characters", () => {
    expect(passwordProblem("a1".repeat(36))).toBeNull();
    expect(passwordProblem("a1".repeat(36) + "x")).toMatch(/at most 72/);
  });
  it("refuses the email, or the part before the @", () => {
    expect(passwordProblem("zolb-test+a@example.com", "zolb-test+a@example.com")).toMatch(/email/);
    expect(passwordProblem("maria.santos2026", "maria.santos2026@gmail.com")).toMatch(/email/);
  });
  it("refuses common and repeated passwords", () => {
    // Capitals and symbols are ignored when comparing with the list.
    expect(passwordProblem("Password123!!")).toMatch(/easy to guess/);
    expect(passwordProblem("PASSWORD-123-")).toMatch(/easy to guess/);
    expect(passwordProblem("password-123-horse")).toBeNull();
    expect(passwordProblem("1234567890123")).toMatch(/easy to guess/);
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/easy to guess/);
    expect(passwordProblem("Qwerty123456")).toMatch(/easy to guess/);
  });
});

describe("registerSchema", () => {
  it("accepts good values and lower-cases the email", () => {
    const parsed = registerSchema.safeParse({ ...good, email: " ZOLB-test+A@Example.com " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("zolb-test+a@example.com");
  });
  it("needs the consent box", () => {
    const parsed = registerSchema.safeParse({ ...good, consent: undefined });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error).consent).toMatch(/tick/);
  });
  it("needs both passwords to match", () => {
    const parsed = registerSchema.safeParse({ ...good, confirmPassword: "something else here" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error).confirmPassword).toMatch(/not the same/);
  });
  it("gives one message per field", () => {
    const parsed = registerSchema.safeParse({
      fullName: "x",
      email: "nope",
      password: "short",
      confirmPassword: "",
      consent: "on",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      expect(Object.keys(errors).sort()).toEqual([
        "confirmPassword",
        "email",
        "fullName",
        "password",
      ]);
    }
  });
});

describe("loginSchema and resetPasswordSchema", () => {
  it("login only checks that something was typed", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "not an email", password: "x" }).success).toBe(false);
  });
  it("reset uses the same strong rule", () => {
    expect(
      resetPasswordSchema.safeParse({ password: "short", confirmPassword: "short" }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({
        password: "correct horse battery",
        confirmPassword: "correct horse battery",
      }).success,
    ).toBe(true);
  });
});
