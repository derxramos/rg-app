"use server";

import { revalidatePath } from "next/cache";

import { ROLES, isPanelRole, type PanelRole, type Role } from "@/lib/permissions";
import { withPanel, type ActionResult } from "@/server/auth/panel";
import { createAuthAdminApi, createAuthPasswordApi } from "@/server/auth/supabase-admin";
import { getDb } from "@/server/db/client";
import { notifyAccountChange } from "@/server/email/notify";
import {
  changeRole,
  createAccountWithPassword,
  inviteAccount,
  resendInvite,
  setAccountActive,
} from "@/server/services/accounts";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");
const roleOf = (formData: FormData, name: string): Role =>
  (ROLES as readonly string[]).includes(text(formData, name))
    ? (text(formData, name) as Role)
    : "user";
const panelRoleOf = (formData: FormData, name: string): PanelRole => {
  const role = roleOf(formData, name);
  return isPanelRole(role) ? role : "staff";
};

// The "Invite" button above the table. The chosen role decides if an owner is needed (checked again inside).
// Two ways: an email invitation, or a temporary password the person must change at the first sign in.
export async function inviteAccountAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withPanel({ action: "accounts.invite", formData }, async ({ admin, ipHash, fresh2fa }) => {
    const input = {
      email: text(formData, "email"),
      fullName: text(formData, "fullName"),
      role: panelRoleOf(formData, "role"),
    };
    if (text(formData, "method") === "password") {
      await createAccountWithPassword(
        getDb(),
        admin,
        createAuthPasswordApi(),
        { ...input, temporaryPassword: text(formData, "temporaryPassword") },
        { fresh2fa, ipHash },
      );
      revalidatePath("/admin/settings/users");
      return {
        ok: true,
        message:
          "The account was made. Give the person the temporary password in a safe way (in person or by phone). They must choose their own password at the first sign in.",
      };
    }
    await inviteAccount(getDb(), admin, createAuthAdminApi(), input, { fresh2fa, ipHash });
    revalidatePath("/admin/settings/users");
    return { ok: true, message: "Invitation sent." };
  });
}

// The "Change role" dialog: ONE role choice and ONE confirm (the code or password of the person making the change).
export async function changeRoleAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withPanel(
    { action: "accounts.change_role", formData },
    async ({ admin, ipHash, fresh2fa }) => {
      const change = await changeRole(
        getDb(),
        admin,
        { accountId: text(formData, "id"), role: roleOf(formData, "role") },
        { fresh2fa, ipHash },
      );
      revalidatePath("/admin/settings/users");
      if (!change) return { ok: true, message: "No change. The account already has that role." };
      await notifyAccountChange({ kind: "role_changed", ...change, actorName: admin.fullName });
      return { ok: true, message: "The role was changed. The person was told by email." };
    },
  );
}

// Turn an account off or on. Off = cannot sign in, and is signed out everywhere.
export async function setActiveAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withPanel(
    { action: "accounts.turn_off", formData },
    async ({ admin, ipHash, fresh2fa }) => {
      const change = await setAccountActive(
        getDb(),
        admin,
        createAuthAdminApi(),
        { accountId: text(formData, "id"), active: text(formData, "intent") === "on" },
        { fresh2fa, ipHash },
      );
      revalidatePath("/admin/settings/users");
      if (!change) return { ok: true, message: "No change." };
      await notifyAccountChange({
        kind: change.active ? "turned_on" : "turned_off",
        ...change,
        actorName: admin.fullName,
      });
      return {
        ok: true,
        message: change.active ? "The account is on again." : "The account is turned off.",
      };
    },
  );
}

// Send the invitation (or the confirmation link) again.
export async function resendInviteAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withPanel(
    { action: "accounts.resend_invite", formData },
    async ({ admin, ipHash, fresh2fa }) => {
      await resendInvite(
        getDb(),
        admin,
        createAuthAdminApi(),
        { accountId: text(formData, "id") },
        { fresh2fa, ipHash },
      );
      revalidatePath("/admin/settings/users");
      return { ok: true, message: "The email was sent again." };
    },
  );
}
