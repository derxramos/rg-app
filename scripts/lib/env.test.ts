import { describe, expect, it } from "vitest";

import { readSeedOwner } from "./env";

describe("readSeedOwner", () => {
  const good = {
    SEED_OWNER_EMAIL: "zolb-test+owner@example.com",
    SEED_OWNER_NAME: "Test Owner",
    SEED_OWNER_PASSWORD: "a-long-test-password",
  };

  it("accepts good values", () => {
    expect(readSeedOwner(good)).toEqual({ owner: good });
  });

  it("rejects a short password", () => {
    const result = readSeedOwner({ ...good, SEED_OWNER_PASSWORD: "short" });
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/12 characters/);
  });

  it("rejects a bad email and missing values", () => {
    expect(readSeedOwner({ ...good, SEED_OWNER_EMAIL: "not-an-email" })).toHaveProperty("error");
    expect(readSeedOwner({})).toHaveProperty("error");
  });
});
