"use server";

import { revalidatePath } from "next/cache";

import { withPanel, type ActionResult } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { purgeActivityLog } from "@/server/services/admin-overview";

// Manual clean-up of old activity log entries (owner and admin). The fresh confirm (the 6-digit code of the person
// doing it, or their password when they have no authenticator yet) is checked by withPanel and again in the service.
export async function purgeActivityAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withPanel({ action: "activity.purge", formData }, async ({ admin, ipHash, fresh2fa }) => {
    const { removed } = await purgeActivityLog(
      getDb(),
      admin,
      { olderThanDays: Number(formData.get("olderThanDays")) },
      { fresh2fa, ipHash },
    );
    revalidatePath("/admin/activity");
    return {
      ok: true,
      message:
        removed === 0
          ? "There was nothing to clean up."
          : `${removed} old ${removed === 1 ? "entry was" : "entries were"} removed.`,
    };
  });
}
