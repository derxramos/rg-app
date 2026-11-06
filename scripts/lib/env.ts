// Small helpers for the Node scripts in /scripts. They run outside Next.js, so they read .env.local themselves.
import { config } from "dotenv";
import { z } from "zod";

export function loadEnv() {
  config({ path: ".env.local", quiet: true });
}

// Returns the value of a variable, or stops with a clear message.
export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env.local and fill it in.`);
    process.exit(1);
  }
  return value;
}

// Variables for the first owner account. The password is never written in code or in git.
export const seedOwnerSchema = z.object({
  SEED_OWNER_EMAIL: z.string().trim().email(),
  SEED_OWNER_NAME: z.string().trim().min(1).max(100),
  // The project rule is 12 characters or more.
  SEED_OWNER_PASSWORD: z.string().min(12, "The owner password needs at least 12 characters."),
});

export type SeedOwner = z.infer<typeof seedOwnerSchema>;

// Reads and checks the owner variables. Returns null (with the reason) when they are not usable.
export function readSeedOwner(
  env: Record<string, string | undefined>,
): { owner: SeedOwner } | { error: string } {
  const result = seedOwnerSchema.safeParse(env);
  if (!result.success) {
    return {
      error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  return { owner: result.data };
}
