import { describe, expect, it } from "vitest";

import {
  HELP_GROUPS,
  STATUS_HELP,
  STATUS_ORDER,
  helpGroupsFor,
  helpTopicForPath,
} from "./help-content";
import { ACTIONS, ROLES, type Role } from "./permissions";
import { REQUEST_STATUSES, STATUS_LABELS } from "./status";

const ids = (role: Role) => helpGroupsFor(role).map((g) => g.id);

describe("help content", () => {
  it("has a complete entry for every request status, named like the badge", () => {
    expect([...STATUS_ORDER]).toEqual([...REQUEST_STATUSES]);
    for (const status of REQUEST_STATUSES) {
      const item = STATUS_HELP[status];
      expect(item.name).toBe(STATUS_LABELS[status]);
      expect(item.what.length).toBeGreaterThan(10);
      expect(item.example.length).toBeGreaterThan(10);
    }
  });

  it("calls the paused status 'On hold'", () => {
    expect(STATUS_LABELS.waiting_for_client).toBe("On hold");
  });

  it("lists every status under Requests", () => {
    const requests = HELP_GROUPS.find((g) => g.id === "requests");
    const statuses = requests?.sections
      .flatMap((s) => s.items)
      .flatMap((i) => (i.status ? [i.status] : []));
    expect(statuses).toEqual([...REQUEST_STATUSES]);
  });

  it("groups follow the left menu order and each group has a unique id", () => {
    expect(HELP_GROUPS.map((g) => g.id)).toEqual([
      "dashboard",
      "requests",
      "settings",
      "activity",
      "export",
      "security",
    ]);
  });

  it("every section and item uses a real permission action and is complete", () => {
    for (const group of HELP_GROUPS) {
      for (const section of group.sections) {
        expect(ACTIONS).toContain(section.action);
        expect(section.items.length).toBeGreaterThan(0);
        for (const item of section.items) {
          if (item.action) expect(ACTIONS).toContain(item.action);
          expect(item.name).not.toBe("");
          expect(item.what).not.toBe("");
          expect(item.example).not.toBe("");
        }
      }
    }
  });

  it("shows each role only what it may use", () => {
    // Staff have no dashboard, settings other than Services, or export.
    expect(ids("staff")).toEqual(["requests", "settings", "activity", "security"]);
    const staffSettings = helpGroupsFor("staff").find((g) => g.id === "settings");
    expect(staffSettings?.sections.map((s) => s.title)).toEqual(["Services and checklists"]);
    const staffRequests = helpGroupsFor("staff").find((g) => g.id === "requests");
    const staffItems = staffRequests?.sections.flatMap((s) => s.items.map((i) => i.name));
    expect(staffItems).not.toContain("Verify or reject a payment");
    expect(staffItems).toContain("Record a payment (cash or other)");
    // Admin and owner see every group.
    for (const role of ["admin", "owner"] as const) {
      expect(ids(role)).toEqual(HELP_GROUPS.map((g) => g.id));
    }
    // A client has no admin help at all.
    expect(ROLES).toContain("user");
    expect(helpGroupsFor("user")).toEqual([]);
  });

  it("maps a page address to its help group", () => {
    expect(helpTopicForPath("/admin")).toBe("dashboard");
    expect(helpTopicForPath("/admin/requests/123")).toBe("requests");
    expect(helpTopicForPath("/admin/settings/payments")).toBe("settings");
    expect(helpTopicForPath("/admin/activity")).toBe("activity");
    expect(helpTopicForPath("/admin/export")).toBe("export");
    expect(helpTopicForPath("/admin/security")).toBe("security");
    expect(helpTopicForPath("/admin/help")).toBeNull();
    expect(helpTopicForPath("/admin/requestsX")).toBeNull();
  });
});
