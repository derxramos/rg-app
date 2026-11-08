import { describe, expect, it } from "vitest";

import {
  ACTIONS,
  PERMISSIONS,
  ROLES,
  can,
  isPanelRole,
  landingPathForRole,
  type Action,
  type Role,
} from "./permissions";

// The full table, written out by hand. If someone changes PERMISSIONS, this test shows the difference.
const EXPECTED: Record<Action, Role[]> = {
  "dashboard.view": ["admin", "owner"],
  "requests.view": ["staff", "admin", "owner"],
  "requests.change_status": ["staff", "admin", "owner"],
  "requests.add_note": ["staff", "admin", "owner"],
  "requests.retry_email": ["staff", "admin", "owner"],
  "requests.open_file": ["staff", "admin", "owner"],
  "payments.verify": ["admin", "owner"],
  "requests.erase_client_data": ["admin", "owner"],
  "services.view": ["staff", "admin", "owner"],
  "services.create": ["staff", "admin", "owner"],
  "services.edit_text": ["staff", "admin", "owner"],
  "checklist.add": ["staff", "admin", "owner"],
  "checklist.edit": ["staff", "admin", "owner"],
  "checklist.reorder": ["staff", "admin", "owner"],
  "services.edit_fee": ["admin", "owner"],
  "services.set_visibility": ["admin", "owner"],
  "services.reorder": ["admin", "owner"],
  "services.payment_links": ["admin", "owner"],
  "checklist.delete": ["admin", "owner"],
  "payment_methods.manage": ["admin", "owner"],
  "site_content.edit": ["admin", "owner"],
  "file_settings.edit": ["admin", "owner"],
  "export.csv": ["admin", "owner"],
  "activity.view": ["staff", "admin", "owner"],
  "accounts.view": ["admin", "owner"],
  "accounts.invite": ["admin", "owner"],
  "accounts.change_role": ["admin", "owner"],
  "accounts.turn_off": ["admin", "owner"],
  "accounts.reset_2fa": ["admin", "owner"],
  "accounts.resend_invite": ["admin", "owner"],
  "accounts.manage_owner": ["owner"],
  "security.self": ["staff", "admin", "owner"],
};

describe("can(): every role times every action", () => {
  it("lists exactly the actions in the expected table", () => {
    expect([...ACTIONS].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const action of Object.keys(EXPECTED) as Action[]) {
    for (const role of ROLES) {
      const allowed = EXPECTED[action].includes(role);
      it(`${role} ${allowed ? "may" : "may NOT"} ${action}`, () => {
        expect(can(role, action)).toBe(allowed);
      });
    }
  }

  it("a client (user) can do no admin action at all", () => {
    for (const action of ACTIONS) expect(can("user", action)).toBe(false);
  });

  it("nobody and an unknown role can do nothing", () => {
    for (const action of ACTIONS) {
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action)).toBe(false);
      expect(can("root" as Role, action)).toBe(false);
    }
  });

  it("admin can do everything an owner can, except manage owner accounts", () => {
    for (const action of ACTIONS) {
      if (action === "accounts.manage_owner") continue;
      expect(can("admin", action)).toBe(can("owner", action));
    }
    expect(can("admin", "accounts.manage_owner")).toBe(false);
  });

  it("staff can use only requests, services, checklists (no delete), activity and their own security page", () => {
    const staffActions = ACTIONS.filter((a) => can("staff", a));
    expect(staffActions.sort()).toEqual(
      [
        "requests.view",
        "requests.change_status",
        "requests.add_note",
        "requests.retry_email",
        "requests.open_file",
        "services.view",
        "services.create",
        "services.edit_text",
        "checklist.add",
        "checklist.edit",
        "checklist.reorder",
        "activity.view",
        "security.self",
      ].sort(),
    );
  });

  it("every action lists only real roles", () => {
    for (const action of ACTIONS) {
      for (const role of PERMISSIONS[action] as readonly string[]) {
        expect(ROLES as readonly string[]).toContain(role);
      }
    }
  });
});

describe("isPanelRole and landing paths", () => {
  it("only staff, admin and owner open the admin area", () => {
    expect(ROLES.filter((r) => isPanelRole(r))).toEqual(["staff", "admin", "owner"]);
    expect(isPanelRole(null)).toBe(false);
    expect(isPanelRole("boss")).toBe(false);
  });

  it("staff land on Requests, admin and owner on the dashboard, clients on My account", () => {
    expect(landingPathForRole("staff")).toBe("/admin/requests");
    expect(landingPathForRole("admin")).toBe("/admin");
    expect(landingPathForRole("owner")).toBe("/admin");
    expect(landingPathForRole("user")).toBe("/account");
  });
});
