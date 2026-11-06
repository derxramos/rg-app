"use server";

import { revalidatePath } from "next/cache";

import { createAuthAdminApi } from "@/server/auth/supabase-admin";
import { OWNER_ONLY } from "@/server/auth/admin-core";
import { withAdmin, type ActionResult } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { inviteAdmin, updateAdmin } from "@/server/services/admin-users";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

// Invite an admin. OWNER ONLY and a fresh 2FA code.
export async function inviteAdminAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withAdmin({ roles: OWNER_ONLY, formData }, async ({ admin, ipHash, fresh2fa }) => {
    await inviteAdmin(
      getDb(),
      admin,
      createAuthAdminApi(),
      {
        email: text(formData, "email"),
        fullName: text(formData, "fullName"),
        role: text(formData, "role") === "owner" ? "owner" : "staff",
      },
      { fresh2fa, ipHash },
    );
    revalidatePath("/admin/settings/users");
    return { ok: true, message: "Invitation sent." };
  });
}

// Change a role, or turn an account on or off. OWNER ONLY and a fresh 2FA code.
export async function updateAdminAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withAdmin({ roles: OWNER_ONLY, formData }, async ({ admin, ipHash, fresh2fa }) => {
    const intent = text(formData, "intent");
    await updateAdmin(
      getDb(),
      admin,
      {
        adminId: text(formData, "id"),
        ...(intent === "owner" || intent === "staff" ? { role: intent } : {}),
        ...(intent === "on" ? { isActive: true } : intent === "off" ? { isActive: false } : {}),
      },
      { fresh2fa, ipHash },
    );
    revalidatePath("/admin/settings/users");
    return { ok: true, message: "Saved." };
  });
}
