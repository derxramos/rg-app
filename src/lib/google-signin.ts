// Rules for "Continue with Google". Pure functions, so they are easy to test.
import { isPanelRole, type Role } from "@/lib/permissions";
import { landingPathFor, safeNextPath } from "@/lib/safe-next";

// The button shows only when the owner has finished the Google setup and set GOOGLE_SIGNIN_ENABLED=true.
export function isGoogleSignInEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

// Where to send a person after Google says yes. Admins never sign in with Google: the admin login
// has extra checks (spam check, rate limit and the 2-step code) and Google would skip them.
export type GoogleLanding = { ok: true; path: string } | { ok: false; reason: "admin" };

export function googleLanding(role: Role, next: string | null | undefined): GoogleLanding {
  // Staff, admin and owner accounts are refused.
  if (isPanelRole(role)) return { ok: false, reason: "admin" };
  return { ok: true, path: safeNextPath(next, landingPathFor("user")) };
}

// The address Google (through Supabase) sends the person back to. It must also be listed in
// Supabase > Authentication > URL Configuration > Redirect URLs (see docs/GOOGLE_SIGN_IN_SETUP.md).
export function googleCallbackUrl(baseUrl: string, next: string | null | undefined): string {
  const safe = safeNextPath(next, "");
  const query = safe ? `?next=${encodeURIComponent(safe)}` : "";
  return `${baseUrl}/auth/callback${query}`;
}

// What came back from Google or Supabase on /auth/callback. Supabase sends ?error=...&error_code=...
// &error_description=... when something is wrong. Only a real "No" on the Google screen is "cancelled".
// Everything else is a failure, with a short safe code (letters, numbers, _ and -) the owner can read.
export type GoogleReturn = { reason: "google-cancelled" | "google-failed"; detail: string };

const safeDetail = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);

export function classifyGoogleReturn(params: URLSearchParams): GoogleReturn {
  const error = params.get("error");
  const errorCode = params.get("error_code");
  // A real "No" on the Google screen has no error_code. Supabase refusals (for example "signup_disabled")
  // also use error=access_denied, but they DO have an error_code, so they are failures.
  if (error === "access_denied" && !errorCode)
    return { reason: "google-cancelled", detail: "access_denied" };
  if (error) return { reason: "google-failed", detail: safeDetail(errorCode) || safeDetail(error) };
  // No error and no code: the page was opened by hand, or the redirect lost its code.
  return { reason: "google-failed", detail: "no_code" };
}
