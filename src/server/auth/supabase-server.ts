import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}

// A Supabase client that reads and writes the login cookies. It uses the PUBLIC key: the admin login
// goes through Supabase Auth, and our own tables are only reached by the server (docs/DATABASE.md).
export async function createSupabaseServer() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll(list) {
          // A Server Component cannot set cookies. The proxy refreshes them, so this is safe to skip.
          try {
            for (const { name, value, options } of list) jar.set(name, value, options);
          } catch {
            /* ignore */
          }
        },
      },
    },
  );
}
