import { describe, expect, it } from "vitest";

import { normalizePhMobile, phoneLast4 } from "./phone";

describe("normalizePhMobile", () => {
  it.each([
    ["9171234567", "+639171234567"],
    ["09171234567", "+639171234567"],
    ["639171234567", "+639171234567"],
    ["+639171234567", "+639171234567"],
    ["+63 917 123 4567", "+639171234567"],
    ["0917-123-4567", "+639171234567"],
    ["(0917) 123 4567", "+639171234567"],
  ])("accepts %s", (input, expected) => {
    expect(normalizePhMobile(input)).toBe(expected);
  });

  it.each([
    "",
    "12345",
    "0817123456", // does not start with 9
    "091712345678", // too long
    "+1 555 123 4567",
    "abc",
    "+63917123456", // too short
  ])("rejects %j", (input) => {
    expect(normalizePhMobile(input)).toBeNull();
  });
});

describe("phoneLast4", () => {
  it("returns the last 4 digits", () => {
    expect(phoneLast4("+639171234567")).toBe("4567");
  });
});
