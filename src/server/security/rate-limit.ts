import { sql } from "drizzle-orm";

import { rateLimits } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  // Seconds until the current window ends (when the person may try again).
  retryAfterSeconds: number;
};

// Counts one try for a key in a fixed time window and says if it is still allowed.
// One atomic statement (INSERT ... ON CONFLICT DO UPDATE) so two requests at the same time cannot
// both slip under the limit. Docs: DATABASE.md "rate_limits".
export async function rateLimit(
  db: AppDb,
  options: { key: string; limit: number; windowSeconds: number; now?: Date },
): Promise<RateLimitResult> {
  const windowMs = options.windowSeconds * 1000;
  const nowMs = (options.now ?? new Date()).getTime();
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;

  const [row] = await db
    .insert(rateLimits)
    .values({ key: options.key, windowStart: new Date(windowStartMs), count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  return {
    allowed: row.count <= options.limit,
    count: row.count,
    retryAfterSeconds: Math.max(1, Math.ceil((windowStartMs + windowMs - nowMs) / 1000)),
  };
}
