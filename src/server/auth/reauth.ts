import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { UserSession } from "./session-core";

// Asks for the password AGAIN before a risky action (deleting the account). A stolen open browser
// should not be enough. It uses a throwaway client that keeps no cookies, so the real login is untouched.
// The development test login has no password, so it passes (it only works in development).
export async function passwordIsRight(session: UserSession, password: string): Promise<boolean> {
  if (session.source === "dev") return process.env.NODE_ENV === "development";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || !password || !session.email) return false;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: session.email, password });
  if (error || data.user?.id !== session.userId) return false;
  // Close the throwaway session again.
  // "local" closes only this throwaway session. The default ("global") would sign the person out of every device.
  await client.auth.signOut({ scope: "local" }).catch(() => {});
  return true;
}
