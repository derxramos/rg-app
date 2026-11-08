import { describe, expect, it } from "vitest";

import { navItemsFor } from "@/components/admin/admin-nav-items";
import { ROLE_LABELS, can, landingPathForRole, type Role } from "@/lib/permissions";

const labels = (role: Role, variant: "sidebar" | "bottom") =>
  navItemsFor(role, variant).map((item) => item.label);

describe("the admin menu per role", () => {
  it("staff see only Requests, Services and Activity", () => {
    expect(labels("staff", "sidebar")).toEqual(["Requests", "Services", "Activity"]);
    expect(labels("staff", "bottom")).toEqual(["Requests", "Services", "Activity"]);
  });
  it("staff Services opens the services page directly (no Settings page with one card)", () => {
    const services = navItemsFor("staff", "sidebar").find((item) => item.label === "Services");
    expect(services?.href).toBe("/admin/settings/services");
    expect(labels("staff", "sidebar")).not.toContain("Settings");
  });
  it("owner and admin see the full menu, and Export only on a computer", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(labels(role, "sidebar")).toEqual([
        "Dashboard",
        "Requests",
        "Settings",
        "Activity",
        "Export",
      ]);
      expect(labels(role, "bottom")).toEqual(["Dashboard", "Requests", "Settings", "Activity"]);
    }
  });
  it("a client gets no admin menu at all", () => {
    expect(labels("user", "sidebar")).toEqual([]);
  });
  it("every item shown is something the role may open", () => {
    for (const role of ["staff", "admin", "owner"] as const) {
      for (const item of navItemsFor(role, "sidebar")) expect(can(role, item.action)).toBe(true);
    }
  });
});

describe("header label and landing page", () => {
  it("shows Owner, Admin or Staff", () => {
    expect(ROLE_LABELS.owner).toBe("Owner");
    expect(ROLE_LABELS.admin).toBe("Admin");
    expect(ROLE_LABELS.staff).toBe("Staff");
  });
  it("staff land on Requests after sign in", () => {
    expect(landingPathForRole("staff")).toBe("/admin/requests");
    expect(landingPathForRole("owner")).toBe("/admin");
  });
});
