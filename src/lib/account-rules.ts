import { can, isPanelRole, type PanelRole, type Role } from "@/lib/permissions";
import type { AccountStatus } from "@/lib/validation/accounts";

// Which buttons the accounts table shows for one row. Pure code, so it is easy to test.
// Showing or hiding is only for comfort: the Server Actions, the service functions and the database check
// the same rules again (src/server/services/accounts.ts).

export type AccountActionRow = { id: string; role: Role; isActive: boolean; status: AccountStatus };

export function accountActionsFor(viewer: { id: string; role: Role }, account: AccountActionRow) {
  const none = { changeRole: false, toggleActive: false, resendInvite: false, reset2fa: false };
  // Nobody changes, turns off or resets their own account.
  if (account.id === viewer.id) return none;

  // Only an owner may change, turn off or re-invite an owner. (Resetting the 2-step login is different:
  // an admin may reset an owner, and then every owner gets an email.)
  const mayTouch = account.role !== "owner" || can(viewer.role, "accounts.manage_owner");
  return {
    changeRole: mayTouch && can(viewer.role, "accounts.change_role"),
    toggleActive: mayTouch && can(viewer.role, "accounts.turn_off"),
    resendInvite:
      mayTouch && can(viewer.role, "accounts.resend_invite") && account.status === "unverified",
    reset2fa: isPanelRole(account.role) && can(viewer.role, "accounts.reset_2fa"),
  };
}

// The roles the viewer may give in "Change role". Only an owner may make an owner.
export function assignableRoles(viewerRole: Role): Role[] {
  if (!can(viewerRole, "accounts.change_role")) return [];
  const roles: Role[] = ["user", "staff", "admin"];
  if (can(viewerRole, "accounts.manage_owner")) roles.push("owner");
  return roles;
}

// The roles the viewer may choose when inviting. Clients make their own account, so they are not listed.
export function invitableRoles(viewerRole: Role): PanelRole[] {
  if (!can(viewerRole, "accounts.invite")) return [];
  const roles: PanelRole[] = ["staff", "admin"];
  if (can(viewerRole, "accounts.manage_owner")) roles.push("owner");
  return roles;
}
