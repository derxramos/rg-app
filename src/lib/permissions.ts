// The ONE place that says who may do what. No server code here, so menus, pages, Server Actions and tests
// all use the same table. The SQL function private.can() in drizzle/0006_single_role.sql mirrors this table
// (a test compares them cell by cell).
//
// Roles (docs/AUTH_AND_ROLES.md):
//   user  = a client
//   staff = an employee (requests, services and checklists, activity: read only)
//   admin = the developer (same power as the owner, except for owner accounts)
//   owner = the business owner

export const ROLES = ["user", "staff", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

// The roles that may open the admin area.
export const PANEL_ROLES = ["staff", "admin", "owner"] as const;
export type PanelRole = (typeof PANEL_ROLES)[number];

const STAFF_UP: readonly Role[] = ["staff", "admin", "owner"];
const ADMIN_UP: readonly Role[] = ["admin", "owner"];
const OWNER_ONLY: readonly Role[] = ["owner"];

// Every action, with the roles that may do it. Add a new action here first.
export const PERMISSIONS = {
  // Dashboard
  "dashboard.view": ADMIN_UP,

  // Requests (staff may NOT verify or reject a payment, and may NOT erase client data)
  "requests.view": STAFF_UP,
  "requests.change_status": STAFF_UP,
  "requests.add_note": STAFF_UP,
  "requests.retry_email": STAFF_UP,
  "requests.open_file": STAFF_UP, // every open is written to the activity log
  "payments.verify": ADMIN_UP, // verify AND reject
  "requests.erase_client_data": ADMIN_UP,

  // Services and checklists (staff: words only. No fee, no hide, no delete)
  "services.view": STAFF_UP,
  "services.create": STAFF_UP, // a new service starts hidden and with no fee
  "services.edit_text": STAFF_UP, // name, short and long description
  "checklist.add": STAFF_UP,
  "checklist.edit": STAFF_UP,
  "checklist.reorder": STAFF_UP,
  "services.edit_fee": ADMIN_UP,
  "services.set_visibility": ADMIN_UP, // hide, show, archive
  "services.reorder": ADMIN_UP,
  "services.payment_links": ADMIN_UP,
  "services.delete": ADMIN_UP, // single and bulk delete of a service (only when no request uses it)
  "checklist.delete": ADMIN_UP,

  // Settings and export
  "payment_methods.manage": ADMIN_UP,
  "site_content.edit": ADMIN_UP,
  "file_settings.edit": ADMIN_UP,
  "export.csv": ADMIN_UP,

  // Activity log: read only
  "activity.view": STAFF_UP,
  "activity.purge": ADMIN_UP, // manual clean-up of old entries (older than 30 days), with a fresh confirm

  // Accounts (Settings > Admin users)
  "accounts.view": ADMIN_UP,
  "accounts.invite": ADMIN_UP,
  "accounts.change_role": ADMIN_UP,
  "accounts.turn_off": ADMIN_UP,
  "accounts.reset_2fa": ADMIN_UP,
  "accounts.resend_invite": ADMIN_UP,
  // Making someone owner, or inviting, demoting or turning off an owner. (Resetting an owner's
  // 2-step login is NOT here: an admin may do that, and all owners get an email.)
  "accounts.manage_owner": OWNER_ONLY,

  // A person's own devices
  "security.self": STAFF_UP,
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof PERMISSIONS;
export const ACTIONS = Object.keys(PERMISSIONS) as Action[];

export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  return (PERMISSIONS[action] as readonly Role[]).includes(role);
}

export function isPanelRole(role: string | null | undefined): role is PanelRole {
  return role === "staff" || role === "admin" || role === "owner";
}

export const ROLE_LABELS: Record<Role, string> = {
  user: "Client",
  staff: "Staff",
  admin: "Admin",
  owner: "Owner",
};

// Where a person lands after sign in when there is no safe "next" path.
export function landingPathForRole(role: Role): string {
  if (role === "staff") return "/admin/requests";
  if (role === "admin" || role === "owner") return "/admin";
  return "/account";
}

// The first page a staff member can use in Settings (they have no Settings page of their own).
export const STAFF_SETTINGS_PATH = "/admin/settings/services";
