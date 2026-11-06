// Checks that the database addresses in .env.local really work. It only runs "select 1" (reads nothing).
// Run: pnpm db:check
// It NEVER prints a password. It shows only the user, the host and the port.

import postgres from "postgres";

import { loadEnv } from "./lib/env";

loadEnv();

const NAMES = ["DATABASE_URL", "DIRECT_DATABASE_URL"] as const;

// A short plain-English hint for the common mistakes.
function hint(message: string, code: string | undefined, host: string): string {
  if (code === "28P01" || /password authentication failed/i.test(message))
    return "The password is wrong, or a password reset has not arrived yet. Reset the database password in Supabase, wait 2 minutes, and copy the new one into every place it is used.";
  if (/tenant or user not found/i.test(message))
    return "The project ID in the user name (postgres.<project id>) is wrong. Copy the string again from Supabase > Connect.";
  if (/^db\..+\.supabase\.co$/i.test(host))
    return "This is the Supabase DIRECT address. It does not work on most networks (IPv6 only). Use the pooler address (pooler.supabase.com).";
  if (/ENETUNREACH|CONNECT_TIMEOUT|ENOTFOUND/i.test(message + (code ?? "")))
    return "The computer could not reach the host. Check the host name and your internet connection.";
  return "See the message above.";
}

async function check(name: string): Promise<boolean> {
  const raw = process.env[name]?.trim();
  if (!raw) {
    console.log(`${name}: NOT SET`);
    return name === "DIRECT_DATABASE_URL"; // the direct URL is optional
  }
  if (!/^postgres(ql)?:\/\//i.test(raw)) {
    console.log(
      `${name}: FAILED. The value must start with postgresql:// . There is extra text in front of it (a paste mistake).`,
    );
    return false;
  }

  let sql: ReturnType<typeof postgres>;
  try {
    sql = postgres(raw, { max: 1, prepare: false, max_pipeline: 1, connect_timeout: 10 });
  } catch {
    console.log(
      `${name}: FAILED. The address cannot be read. A special character in the password may need to be removed.`,
    );
    return false;
  }

  const { user, host, port } = sql.options as unknown as {
    user: string;
    host: string[];
    port: number[];
  };
  const where = `user ${user}, host ${host[0]}, port ${port[0]}`;
  try {
    await sql`select 1`;
    console.log(`${name}: CONNECTED (${where})`);
    return true;
  } catch (error) {
    const e = error as { message?: string; code?: string };
    console.log(`${name}: FAILED (${where})`);
    console.log(`  Message: ${e.message ?? "unknown"}`);
    console.log(`  What to do: ${hint(e.message ?? "", e.code, host[0])}`);
    return false;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function main() {
  let allGood = true;
  for (const name of NAMES) if (!(await check(name))) allGood = false;
  process.exit(allGood ? 0 : 1);
}

void main();
