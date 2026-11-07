import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { AuthDeleteApi } from "@/server/services/account";
import type { AuthAdminApi } from "@/server/services/admin-users";

import { getBaseUrl } from "@/lib/site-url";

// Supabase Auth admin calls (needs the SECRET key, so server only). Anyone can sign up as a normal user;
// an invite or "Make admin" (owner only) is the only way to become an admin (docs/AUTH_AND_ROLES.md).
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
        redirectTo: `${getBaseUrl()}/login`,
      });
      if (error || !data.user)
        throw Object.assign(new Error(`Could not invite: ${error?.message ?? "unknown error"}`), {
          code: "invalid",
        });
      return { id: data.user.id };
    },
  };
}

// Removes a login (needs the SECRET key, so server only). Used when a user deletes their own account.
// Without the Supabase keys (local development only) it does nothing, because there is no login to remove.
export function createAuthDeleteApi(): AuthDeleteApi {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) {
    if (process.env.NODE_ENV === "development") return { deleteUser: async () => {} };
    throw new Error("Deleting accounts needs the Supabase keys.");
  }
  const client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async deleteUser(userId) {
      // false = remove the user completely (not a "soft delete" that keeps a hashed id).
      const { error } = await client.auth.admin.deleteUser(userId, false);
      if (error) throw new Error(`Could not delete the login: ${error.message}`);
    },
  };
}
