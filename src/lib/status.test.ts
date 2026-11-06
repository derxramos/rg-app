import { describe, expect, it } from "vitest";

import {
  REQUEST_STATUSES,
  STATUS_LABELS,
  canChangeStatus,
  isClosedStatus,
  isReopen,
  nextStatusesFor,
  type RequestStatus,
} from "./status";

describe("status labels", () => {
  it("has a label for every status", () => {
    for (const status of REQUEST_STATUSES) {
      expect(STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe("admin status changes (DATABASE.md table)", () => {
  const cases: [RequestStatus, RequestStatus[]][] = [
    ["submitted", ["under_review", "waiting_for_client", "payment_submitted", "cancelled"]],
    [
      "under_review",
      ["waiting_for_client", "payment_submitted", "payment_verified", "in_progress", "cancelled"],
    ],
    ["waiting_for_client", ["under_review", "payment_submitted", "cancelled"]],
    ["payment_submitted", ["under_review", "waiting_for_client", "payment_verified", "cancelled"]],
    ["payment_verified", ["in_progress", "completed", "cancelled"]],
    ["in_progress", ["waiting_for_client", "completed", "cancelled"]],
    // Completed can only be opened again. Cancelled is final.
    ["completed", ["in_progress"]],
    ["cancelled", []],
  ];

  it.each(cases)("from %s offers exactly the allowed next statuses", (from, expected) => {
    expect([...nextStatusesFor("admin", from)].sort()).toEqual([...expected].sort());
  });

  it("does not let an admin move a draft", () => {
    expect(nextStatusesFor("admin", "draft")).toEqual([]);
  });

  it("never allows a status to change to itself", () => {
    for (const status of REQUEST_STATUSES) {
      expect(canChangeStatus("admin", status, status)).toBe(false);
    }
  });

  it("rejects a jump that is not in the table", () => {
    expect(canChangeStatus("admin", "submitted", "completed")).toBe(false);
    expect(canChangeStatus("admin", "in_progress", "submitted")).toBe(false);
    expect(canChangeStatus("admin", "cancelled", "in_progress")).toBe(false);
  });
});

describe("client status changes", () => {
  it("can submit a draft, with or without a payment", () => {
    expect(canChangeStatus("client", "draft", "submitted")).toBe(true);
    expect(canChangeStatus("client", "draft", "payment_submitted")).toBe(true);
  });

  it("can add a payment when the request is open for it", () => {
    for (const from of ["submitted", "under_review", "waiting_for_client"] as const) {
      expect(canChangeStatus("client", from, "payment_submitted")).toBe(true);
    }
  });

  it("cannot do anything else", () => {
    expect(canChangeStatus("client", "draft", "cancelled")).toBe(false);
    expect(canChangeStatus("client", "submitted", "under_review")).toBe(false);
    expect(canChangeStatus("client", "payment_submitted", "payment_verified")).toBe(false);
    expect(canChangeStatus("client", "in_progress", "completed")).toBe(false);
    expect(canChangeStatus("client", "completed", "in_progress")).toBe(false);
  });
});

describe("system status changes", () => {
  it("only cancels an expired draft", () => {
    expect(canChangeStatus("system", "draft", "cancelled")).toBe(true);
    expect(canChangeStatus("system", "draft", "submitted")).toBe(false);
    expect(canChangeStatus("system", "submitted", "cancelled")).toBe(false);
  });
});

describe("helpers", () => {
  it("knows what a re-open is", () => {
    expect(isReopen("completed", "in_progress")).toBe(true);
    expect(isReopen("cancelled", "in_progress")).toBe(false);
    expect(isReopen("in_progress", "completed")).toBe(false);
  });

  it("knows which statuses are closed", () => {
    expect(isClosedStatus("completed")).toBe(true);
    expect(isClosedStatus("cancelled")).toBe(true);
    expect(isClosedStatus("in_progress")).toBe(false);
  });
});
