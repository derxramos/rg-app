import { describe, expect, it } from "vitest";

import { accountActionsFor, assignableRoles, invitableRoles } from "./account-rules";
import type { Role } from "./permissions";

const row = (id: string, role: Role, over: Partial<{ isActive: boolean; status: string }> = {}) =>
  ({ id, role, isActive: true, status: "active", ...over }) as Parameters<
    typeof accountActionsFor
  >[1];
const owner = { id: "o", role: "owner" as const };
const admin = { id: "a", role: "admin" as const };
const staff = { id: "s", role: "staff" as const };

describe("accountActionsFor", () => {
  it("nobody gets any action on their own row", () => {
    for (const viewer of [owner, admin, staff]) {
      expect(accountActionsFor(viewer, row(viewer.id, viewer.role))).toEqual({
        changeRole: false,
        toggleActive: false,
        resendInvite: false,
        reset2fa: false,
      });
    }
  });
  it("an owner may do everything to others", () => {
    expect(accountActionsFor(owner, row("x", "owner"))).toMatchObject({
      changeRole: true,
      toggleActive: true,
      reset2fa: true,
    });
    expect(accountActionsFor(owner, row("x", "staff"))).toMatchObject({
      changeRole: true,
      toggleActive: true,
      reset2fa: true,
    });
  });
  it("an admin may not change or turn off an owner, but may reset an owner's 2-step login", () => {
    expect(accountActionsFor(admin, row("x", "owner"))).toEqual({
      changeRole: false,
      toggleActive: false,
      resendInvite: false,
      reset2fa: true,
    });
    expect(accountActionsFor(admin, row("x", "staff"))).toMatchObject({
      changeRole: true,
      toggleActive: true,
      reset2fa: true,
    });
  });
  it("staff get nothing at all", () => {
    expect(accountActionsFor(staff, row("x", "user"))).toEqual({
      changeRole: false,
      toggleActive: false,
      resendInvite: false,
      reset2fa: false,
    });
  });
  it("reset 2-step login is only for panel roles, resend only for unverified emails", () => {
    expect(accountActionsFor(owner, row("x", "user")).reset2fa).toBe(false);
    expect(accountActionsFor(owner, row("x", "user", { status: "unverified" })).resendInvite).toBe(
      true,
    );
    expect(accountActionsFor(owner, row("x", "user", { status: "active" })).resendInvite).toBe(
      false,
    );
  });
});

describe("role choices", () => {
  it("only an owner can give or invite the owner role", () => {
    expect(assignableRoles("owner")).toEqual(["user", "staff", "admin", "owner"]);
    expect(assignableRoles("admin")).toEqual(["user", "staff", "admin"]);
    expect(assignableRoles("staff")).toEqual([]);
    expect(invitableRoles("owner")).toEqual(["staff", "admin", "owner"]);
    expect(invitableRoles("admin")).toEqual(["staff", "admin"]);
    expect(invitableRoles("staff")).toEqual([]);
    expect(invitableRoles("user")).toEqual([]);
  });
});
