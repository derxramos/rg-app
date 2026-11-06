import "server-only";

import { getTokenSecret } from "@/server/env";
import { hmacHex } from "@/server/security/tokens";

// Finds the visitor's IP address from the request headers.
// Netlify sets x-nf-client-connection-ip. Other hosts use x-forwarded-for (first value).
export function readClientIp(headers: Headers): string {
  const netlify = headers.get("x-nf-client-connection-ip");
  if (netlify) return netlify.trim();
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

// We never store a raw IP address. Rate limits and the activity log use this hash instead.
export function hashIp(ip: string): string {
  return hmacHex(getTokenSecret(), `ip:${ip}`);
}
