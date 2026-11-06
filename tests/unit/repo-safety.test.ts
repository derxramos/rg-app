// The repository will be PUBLIC. This test reads every file that git tracks and fails if it finds a key, a password,
// a database address with a password, or a file that must never be committed. (Git history was also checked once.)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  // Pictures and fonts are binary.
  .filter((f) => !/\.(jpg|jpeg|png|ico|woff2|lock)$/i.test(f) && f !== "pnpm-lock.yaml");

const PATTERNS: [string, RegExp][] = [
  ["a login token (JWT)", /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/],
  ["a Stripe-style live key", /sk_live_[A-Za-z0-9]{10,}/],
  ["a Brevo API key", /xkeysib-[A-Za-z0-9-]{20,}/],
  ["a Supabase secret key", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["a GitHub token", /gh[pousr]_[A-Za-z0-9]{30,}/],
  // A database address with a password, to a server that is not this computer.
  [
    "a database address with a password",
    /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]{4,}@(?!127\.0\.0\.1|localhost)[a-z0-9.-]+/i,
  ],
];

describe("repository safety (public repo)", () => {
  it("finds the files (so the test cannot pass by reading nothing)", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("contains no key, token, password or private address", () => {
    const found: string[] = [];
    for (const file of files) {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      for (const [label, pattern] of PATTERNS)
        if (pattern.test(text)) found.push(`${file}: ${label}`);
    }
    expect(found).toEqual([]);
  });

  it("does not track files that must never be committed", () => {
    const bad = files.filter(
      (f) =>
        /(^|\/)\.env($|\.local|\.production|\.development)/.test(f) ||
        /^\.pglite\/|^\.local-storage\/|settings\.local\.json$|\.pem$|id_rsa/.test(f),
    );
    expect(bad).toEqual([]);
  });

  it(".env.example has no real values for secrets", () => {
    const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
    for (const name of [
      "DATABASE_URL",
      "DIRECT_DATABASE_URL",
      "SUPABASE_SECRET_KEY",
      "TURNSTILE_SECRET_KEY",
      "BREVO_API_KEY",
      "TOKEN_HASH_SECRET",
      "SEED_OWNER_PASSWORD",
    ]) {
      const line = example.split("\n").find((l) => l.startsWith(`${name}=`));
      expect(line, name).toBeDefined();
      expect(line!.slice(name.length + 1).trim(), `${name} must be empty in .env.example`).toBe("");
    }
  });
});
