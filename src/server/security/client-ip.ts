import "server-only";

import { getTokenSecret } from "@/server/env";
import { hmacHex } from "@/server/security/tokens";

// Finds the visitor's IP address from the request headers.
// On Vercel, x-vercel-forwarded-for is set by Vercel itself and a visitor cannot fake it. We do NOT read
// x-nf-client-connection-ip (a Netlify header): on Vercel a visitor could send it and dodge the rate limits.
export function readClientIp(headers: Headers): string {
  const vercel = headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

// We never store a raw IP address. Rate limits and the activity log use this hash instead.
export function hashIp(ip: string): string {
  return hmacHex(getTokenSecret(), `ip:${ip}`);
}
