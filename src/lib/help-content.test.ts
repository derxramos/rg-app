import { describe, expect, it } from "vitest";

import { HELP_SECTIONS, STATUS_HELP, STATUS_ORDER } from "./help-content";
import { ACTIONS } from "./permissions";
import { REQUEST_STATUSES, STATUS_LABELS } from "./status";

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

  it("every section uses a real permission action and has complete items", () => {
    const ids = new Set<string>();
    for (const section of HELP_SECTIONS) {
      expect(ACTIONS).toContain(section.action);
      expect(ids.has(section.id)).toBe(false);
      ids.add(section.id);
      expect(section.items.length).toBeGreaterThan(0);
      for (const item of section.items) {
        expect(item.name).not.toBe("");
        expect(item.what).not.toBe("");
        expect(item.example).not.toBe("");
      }
    }
  });
});
