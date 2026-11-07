import { describe, expect, it } from "vitest";

import { displayName } from "./display-name";

describe("displayName", () => {
  it("uses the first word and its first letter", () => {
    expect(displayName("Maria Santos")).toEqual({ name: "Maria", initial: "M" });
    expect(displayName("  jose   dela Cruz ")).toEqual({ name: "jose", initial: "J" });
  });

  it("falls back to Account when there is no name", () => {
    for (const empty of ["", "   ", null, undefined]) {
      expect(displayName(empty)).toEqual({ name: "Account", initial: "A" });
    }
  });

  it("handles letters with accents", () => {
    expect(displayName("Ñico Reyes")).toEqual({ name: "Ñico", initial: "Ñ" });
  });
});
