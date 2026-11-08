// Safe "go back to where you were" paths. No server code here, so the proxy, the pages and the tests can all use it.

import { landingPathForRole, type Role } from "@/lib/permissions";

const MAX_LENGTH = 300;

// Returns the path only if it stays inside THIS site. Anything else (another website, a protocol-relative
// address like //evil.com, a backslash trick, control characters) gives the fallback.
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || next.length > MAX_LENGTH) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  // The login pages themselves are never a good place to come back to.
  const pathOnly = next.split(/[?#]/)[0];
  if (/^\/(login|register|forgot-password|reset-password|auth)(\/|$)/.test(pathOnly))
    return fallback;
  return next;
}

// Where a person lands after login when there is no safe "next" path.
export function landingPathFor(role: Role): string {
  return landingPathForRole(role);
}

// The login page address for a visitor who must sign in first. `expired` adds the "session ended" message.
export function loginUrlFor(path: string, options: { expired?: boolean } = {}): string {
  const params = new URLSearchParams();
  const next = safeNextPath(path, "");
  if (next) params.set("next", next);
  if (options.expired) params.set("reason", "expired");
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}
