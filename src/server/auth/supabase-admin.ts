import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { AuthDeleteApi } from "@/server/services/account";
import type { AuthAdminApi, AuthMfaAdminApi, AuthPasswordApi } from "@/server/services/accounts";

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
    async resendInvite(email) {
      // Inviting an address that has not opened its first invitation sends a new invitation.
      const { error } = await client.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${getBaseUrl()}/login`,
      });
      if (!error) return;
      // A person who signed up themselves gets the confirmation link again.
      const { error: resendError } = await client.auth.resend({ type: "signup", email });
      if (resendError)
        throw Object.assign(new Error(`Could not send the email: ${resendError.message}`), {
          code: "invalid",
        });
    },
    async setBanned(userId, banned) {
      // "none" lifts the ban. A very long time is "turned off until someone turns it on".
      const { error } = await client.auth.admin.updateUserById(userId, {
        ban_duration: banned ? "876000h" : "none",
      });
      if (error)
        throw Object.assign(new Error(`Could not update the login: ${error.message}`), {
          code: "invalid",
        });
    },
  };
}

// Removes the authenticator devices of another person (needs the SECRET key, so server only).
export function createAuthMfaAdminApi(): AuthMfaAdminApi {
  // The keys are checked when Supabase is first used, so the form checks (typed email, role) answer first.
  const client = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const secret = process.env.SUPABASE_SECRET_KEY?.trim();
    if (!url || !secret) {
      throw Object.assign(
        new Error("Resetting 2-step login needs the Supabase keys. They are not set up yet."),
        { code: "invalid" },
      );
    }
    return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  };
  return {
    async listFactors(userId) {
      const { data, error } = await client().auth.admin.mfa.listFactors({ userId });
      if (error)
        throw Object.assign(new Error(`Could not read the devices: ${error.message}`), {
          code: "invalid",
        });
      return (data?.factors ?? []).map((f) => ({ id: f.id, verified: f.status === "verified" }));
    },
    async deleteFactor(userId, factorId) {
      const { error } = await client().auth.admin.mfa.deleteFactor({ id: factorId, userId });
      if (error)
        throw Object.assign(new Error(`Could not remove a device: ${error.message}`), {
          code: "invalid",
        });
    },
  };
}

// Makes a verified login with a temporary password (needs the SECRET key, so server only).
export function createAuthPasswordApi(): AuthPasswordApi {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) {
    throw Object.assign(
      new Error("Making admin accounts needs the Supabase keys. They are not set up yet."),
      { code: "invalid" },
    );
  }
  const client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async createWithPassword({ email, password, fullName }) {
      const { data, error } = await client.auth.admin.createUser({
        email,
        password,
        // The owner knows this person, so the email counts as verified. They still sign in with the
        // temporary password and must change it at once.
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error || !data.user)
        throw Object.assign(
          new Error(`Could not create the login: ${error?.message ?? "unknown error"}`),
          { code: "invalid" },
        );
      return { id: data.user.id };
    },
    async remove(userId) {
      await client.auth.admin.deleteUser(userId, false);
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
