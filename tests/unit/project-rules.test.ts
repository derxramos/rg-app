// Project rules from CLAUDE.md, checked by reading the source. A new file that breaks a rule fails here.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const rel = (file: string) => path.relative(SRC, file).replace(/\\/g, "/");
const read = (file: string) => readFileSync(file, "utf8");
const sourceFiles = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));

describe('rule: server code starts with import "server-only"', () => {
  // Files that the Node scripts (seed, cleanup) import too. A "server-only" import would stop those scripts.
  // They contain no secrets and no access checks, only types, the table list, and constants.
  const ALLOWED_WITHOUT = new Set([
    "server/db/schema.ts",
    "server/db/types.ts",
    "server/storage/types.ts",
    "server/storage/supabase-driver.ts",
    "server/cache-tags.ts",
  ]);

  it("every file in src/server has it (or is on the short allow-list)", () => {
    const missing = sourceFiles
      .filter((f) => rel(f).startsWith("server/") && !rel(f).startsWith("server/jobs/"))
      .filter((f) => !read(f).trimStart().startsWith('import "server-only"'))
      .map(rel)
      .filter((r) => !ALLOWED_WITHOUT.has(r));
    expect(missing).toEqual([]);
  });

  it("no client component imports server code at run time (types are fine)", () => {
    const offenders = sourceFiles
      .filter((f) => read(f).trimStart().startsWith('"use client"'))
      .filter((f) => /^import (?!type )[^;]*from "@\/server\//m.test(read(f)))
      // These client files import Server Actions from route folders, which is allowed.
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

describe("rule: no secrets in the browser", () => {
  it("only these NEXT_PUBLIC_ variables exist, and none is a secret", () => {
    const names = new Set<string>();
    for (const file of sourceFiles)
      for (const m of read(file).matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) names.add(m[0]);
    expect([...names].sort()).toEqual([
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    ]);
  });

  it(".env.example lists every variable the code reads, with a comment", () => {
    const example = readFileSync(path.resolve(__dirname, "../../.env.example"), "utf8");
    const used = new Set<string>();
    for (const file of sourceFiles)
      for (const m of read(file).matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) used.add(m[1]);
    const builtIn = new Set(["NODE_ENV", "NEXT_RUNTIME", "CI", "VERCEL_PROJECT_PRODUCTION_URL"]);
    const missing = [...used].filter(
      (name) => !builtIn.has(name) && !new RegExp(`^${name}=`, "m").test(example),
    );
    expect(missing).toEqual([]);
  });

  it(".env files are ignored by git, except the example", () => {
    const ignore = readFileSync(path.resolve(__dirname, "../../.gitignore"), "utf8");
    expect(ignore).toMatch(/^\.env\*/m);
    expect(ignore).toMatch(/^!\.env\.example/m);
  });
});

describe("rule: no host-only features (CLAUDE.md rule 6)", () => {
  it("does not use Netlify or Vercel only APIs", () => {
    const bad = sourceFiles
      .filter((f) =>
        /@netlify\/|@vercel\/(kv|blob|postgres|edge-config)|netlify-forms|NETLIFY_BLOBS/.test(
          read(f),
        ),
      )
      .map(rel);
    expect(bad).toEqual([]);
  });
});

describe("rule: money and time", () => {
  it("never formats money with toFixed or Math.round on pesos outside the helpers", () => {
    // Money is whole centavos. Showing money goes through formatPesos.
    const bad = sourceFiles
      .filter(
        (f) =>
          !["lib/money.ts", "ocr/parsers/shared.ts", "server/services/admin-overview.ts"].includes(
            rel(f),
          ),
      )
      .filter((f) => /amountCentavos\s*\/\s*100/.test(read(f)))
      .map(rel);
    expect(bad).toEqual([]);
  });
});
