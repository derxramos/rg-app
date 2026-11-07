// Rules for "Continue with Google". Pure functions, so they are easy to test.
import { landingPathFor, safeNextPath } from "@/lib/safe-next";

// The button shows only when the owner has finished the Google setup and set GOOGLE_SIGNIN_ENABLED=true.
export function isGoogleSignInEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

// Where to send a person after Google says yes. Admins never sign in with Google: the admin login
// has extra checks (spam check, rate limit and the 2-step code) and Google would skip them.
export type GoogleLanding = { ok: true; path: string } | { ok: false; reason: "admin" };

export function googleLanding(
  role: "user" | "admin",
  next: string | null | undefined,
): GoogleLanding {
  if (role === "admin") return { ok: false, reason: "admin" };
  return { ok: true, path: safeNextPath(next, landingPathFor("user")) };
}

// The address Google (through Supabase) sends the person back to. It must also be listed in
// Supabase > Authentication > URL Configuration > Redirect URLs (see docs/GOOGLE_SIGN_IN_SETUP.md).
export function googleCallbackUrl(baseUrl: string, next: string | null | undefined): string {
  const safe = safeNextPath(next, "");
  const query = safe ? `?next=${encodeURIComponent(safe)}` : "";
  return `${baseUrl}/auth/callback${query}`;
}
