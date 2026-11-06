// Seed script: default settings, starting services (names only), and the first owner account.
// Run: pnpm db:seed
// Safe to run again: it never overwrites values the owner has already changed.
//
// IMPORTANT: this script creates an account with role "owner" (the highest role).
// It is printed clearly at the end so it is never done silently.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { SETTING_KEYS, DEFAULT_SETTINGS, parseSetting } from "../src/lib/validation/settings";
import { slugify } from "../src/lib/slug";
import { adminProfiles, paymentMethods, services, siteSettings } from "../src/server/db/schema";
import { SAMPLE_ACCOUNT, SAMPLE_PAYMENT_METHODS } from "./seed-data/payment-methods";
import { SEED_SERVICES } from "./seed-data/services";
import { loadEnv, readSeedOwner, requireEnv } from "./lib/env";

loadEnv();

async function main() {
  // The direct connection is best for scripts. The pooled URL also works.
  const url = process.env.DIRECT_DATABASE_URL?.trim() || requireEnv("DATABASE_URL");
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  try {
    // 1. Default settings. onConflictDoNothing keeps any value the owner already edited.
    for (const key of SETTING_KEYS) {
      const value = parseSetting(key, DEFAULT_SETTINGS[key]);
      await db.insert(siteSettings).values({ key, value }).onConflictDoNothing();
    }
    console.log(`Settings: checked ${SETTING_KEYS.length} keys.`);

    // 2. Services (names only). The checklists stay empty on purpose.
    let order = 0;
    for (const service of SEED_SERVICES) {
      const slug = slugify(service.name);
      if (!slug) throw new Error(`Service name "${service.name}" cannot make a URL part.`);
      await db
        .insert(services)
        .values({ slug, name: service.name, sortOrder: order++ })
        .onConflictDoNothing();
    }
    console.log(`Services: ${SEED_SERVICES.length} in the seed list (checklists are empty).`);

    // 3. Sample payment methods (fake, marked SAMPLE, OFF unless asked). Added only when none exist.
    const existing = await db.select({ id: paymentMethods.id }).from(paymentMethods).limit(1);
    if (existing.length === 0) {
      const activate = process.env.SEED_ACTIVATE_SAMPLE_PAYMENTS === "1";
      let sort = 0;
      for (const m of SAMPLE_PAYMENT_METHODS) {
        await db.insert(paymentMethods).values({
          ...SAMPLE_ACCOUNT,
          name: m.name,
          parserKey: m.parserKey,
          isActive: activate,
          sortOrder: sort++,
        });
      }
      console.log(
        `Payment methods: added ${SAMPLE_PAYMENT_METHODS.length} SAMPLE methods (${activate ? "ON" : "OFF"}).`,
      );
    } else {
      console.log("Payment methods: already exist, left as they are.");
    }

    // 4. First owner account.
    await seedOwner(db);
  } finally {
    await client.end();
  }
}

async function seedOwner(db: ReturnType<typeof drizzle>) {
  const parsed = readSeedOwner(process.env);
  if ("error" in parsed) {
    console.log(`Owner account: skipped. ${parsed.error}`);
    console.log(
      "Set SEED_OWNER_EMAIL, SEED_OWNER_NAME and SEED_OWNER_PASSWORD, then run the seed again.",
    );
    return;
  }
  const { owner } = parsed;

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Find an existing login first, so running the seed twice does not fail.
  const existing = await findUserByEmail(supabase, owner.SEED_OWNER_EMAIL);
  let userId = existing?.id;
  let created = false;

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: owner.SEED_OWNER_EMAIL,
      password: owner.SEED_OWNER_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`Could not create the owner login: ${error?.message}`);
    userId = data.user.id;
    created = true;
  }

  await db
    .insert(adminProfiles)
    .values({
      id: userId,
      fullName: owner.SEED_OWNER_NAME,
      email: owner.SEED_OWNER_EMAIL,
      role: "owner",
    })
    .onConflictDoNothing();

  console.log("");
  console.log("==================================================================");
  console.log(
    ` OWNER ACCOUNT ${created ? "CREATED" : "already existed (login kept, profile checked)"}`,
  );
  console.log(` Email: ${owner.SEED_OWNER_EMAIL}   Role: owner`);
  console.log(" The owner must set up 2FA (an authenticator app) at the first login.");
  console.log("==================================================================");
}

// Supabase has no "find by email" call, so we page through the users.
async function findUserByEmail(supabase: SupabaseClient, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`Could not list users: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 100) return null;
  }
  return null;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
