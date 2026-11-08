import "server-only";

import { headers } from "next/headers";

import { getDb } from "@/server/db/client";
import { activityLog } from "@/server/db/schema";
import { hashIp, readClientIp } from "@/server/security/client-ip";

// Writes a device change to the activity log: who, what, and how many devices there are. It lives in its own
// file (not in a "use server" file) so it is never a public Server Action that anyone could call.
export async function recordDeviceEvent(
  userId: string,
  action: "mfa.device_added" | "mfa.device_removed",
  details: Record<string, unknown>,
) {
  await getDb()
    .insert(activityLog)
    .values({
      actorType: "admin",
      actorId: userId,
      action,
      entityType: "account",
      entityId: userId,
      details,
      ipHash: hashIp(readClientIp(await headers())),
    });
}
