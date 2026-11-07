import "server-only";

import { activityLog } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

export type AuthAction =
  | "auth.signup"
  | "auth.login.success"
  | "auth.login.failed"
  | "auth.logout"
  | "auth.password_reset"
  | "auth.email_verified"
  | "profile.updated"
  | "role.changed"
  | "account.deleted"
  | "data.exported";

// Writes one sign-in related row to activity_log (append-only). Never put a password, a token or an
// email address in `details`. The IP is already a hash.
export async function logAuthEvent(
  db: AppDb,
  event: {
    action: AuthAction;
    // Who did it. Null when we do not know (for example a failed login).
    userId: string | null;
    isAdmin?: boolean;
    ipHash: string | null;
    details?: Record<string, unknown>;
  },
) {
  await db.insert(activityLog).values({
    actorType: event.userId ? (event.isAdmin ? "admin" : "client") : "system",
    actorId: event.userId,
    action: event.action,
    entityType: "auth",
    entityId: event.userId,
    details: event.details ?? {},
    ipHash: event.ipHash,
  });
}
