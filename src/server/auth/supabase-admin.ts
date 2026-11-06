import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { AuthAdminApi } from "@/server/services/admin-users";

import { getBaseUrl } from "@/lib/site-url";

// Supabase Auth admin calls (needs the SECRET key, so server only). Public sign-up is OFF in Supabase,
// so this invite is the only way a new admin login is created (docs/ARCHITECTURE.md section 5).
export function createAuthAdminApi(): AuthAdminApi {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) {
    throw Object.assign(
      new Error("Inviting admins needs the Supabase keys. They are not set up yet."),
      { code: "invalid" },
    );
  }
  const client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async invite(email) {
      const { data, error } = await client.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${getBaseUrl()}/admin/login`,
      });
      if (error || !data.user)
        throw Object.assign(new Error(`Could not invite: ${error?.message ?? "unknown error"}`), {
          code: "invalid",
        });
      return { id: data.user.id };
    },
  };
}
