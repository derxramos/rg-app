"use server";

import { revalidatePath } from "next/cache";

import { createAuthAdminApi, createAuthPasswordApi } from "@/server/auth/supabase-admin";
import { OWNER_ONLY } from "@/server/auth/admin-core";
import { withAdmin, type ActionResult } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import {
  createAdminWithPassword,
  inviteAdmin,
  promoteToAdmin,
  removeAdmin,
  setAccountRole,
  updateAdmin,
} from "@/server/services/admin-users";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

// "Existing accounts": the User / Admin dropdown and Save. OWNER ONLY and a fresh 2FA code.
export async function setAccountRoleAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withAdmin({ roles: OWNER_ONLY, formData }, async ({ admin, ipHash, fresh2fa }) => {
    const role = text(formData, "role") === "admin" ? "admin" : "user";
    const result = await setAccountRole(
      getDb(),
      admin,
      { accountId: text(formData, "id"), role },
      { fresh2fa, ipHash },
    );
    revalidatePath("/admin/settings/users");
    return {
      ok: true,
      message:
        result === "same"
          ? "No change. The account already has that role."
          : role === "admin"
            ? "That account is now an admin."
            : "That account is now a normal user.",
    };
  });
}

// "New admin account": makes a verified login with a temporary password. OWNER ONLY and a fresh 2FA code.
export async function createAdminWithPasswordAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withAdmin({ roles: OWNER_ONLY, formData }, async ({ admin, ipHash, fresh2fa }) => {
    await createAdminWithPassword(
      getDb(),
      admin,
      createAuthPasswordApi(),
      {
        email: text(formData, "email"),
        fullName: text(formData, "fullName"),
        role: text(formData, "level") === "owner" ? "owner" : "staff",
        temporaryPassword: text(formData, "temporaryPassword"),
      },
      { fresh2fa, ipHash },
    );
    revalidatePath("/admin/settings/users");
    return {
      ok: true,
      message:
        "The admin account was made. Give the person the temporary password in a safe way. They must choose their own password at the first sign in.",
    };
  });
}

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

// Make an existing account an admin. OWNER ONLY and a fresh 2FA code.
export async function promoteAdminAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withAdmin({ roles: OWNER_ONLY, formData }, async ({ admin, ipHash, fresh2fa }) => {
    await promoteToAdmin(
      getDb(),
      admin,
      {
        email: text(formData, "email"),
        role: text(formData, "role") === "owner" ? "owner" : "staff",
      },
      { fresh2fa, ipHash },
    );
    revalidatePath("/admin/settings/users");
    return { ok: true, message: "That person is now an admin." };
  });
}

// Take the admin role away. OWNER ONLY and a fresh 2FA code.
export async function removeAdminAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withAdmin({ roles: OWNER_ONLY, formData }, async ({ admin, ipHash, fresh2fa }) => {
    await removeAdmin(getDb(), admin, { adminId: text(formData, "id") }, { fresh2fa, ipHash });
    revalidatePath("/admin/settings/users");
    return { ok: true, message: "The admin role was removed." };
  });
}
