import { describe, expect, it } from "vitest";

import { formatManilaDate, formatManilaDateTime } from "./time";

describe("Manila time formatting", () => {
  it("shows UTC times in Asia/Manila (UTC+8)", () => {
    // 01:37 UTC is 09:37 in Manila, the same day.
    expect(formatManilaDateTime("2026-11-06T01:37:00Z")).toBe("Nov 6, 2026, 9:37 AM");
  });

  it("moves to the next day when UTC is late in the evening", () => {
    // 20:00 UTC on Nov 6 is 04:00 on Nov 7 in Manila.
    expect(formatManilaDate("2026-11-06T20:00:00Z")).toBe("Nov 7, 2026");
    expect(formatManilaDateTime("2026-11-06T20:00:00Z")).toBe("Nov 7, 2026, 4:00 AM");
  });

  it("shows PM in upper case", () => {
    expect(formatManilaDateTime("2026-11-06T07:05:00Z")).toBe("Nov 6, 2026, 3:05 PM");
  });

  it("accepts Date objects and millisecond numbers", () => {
    const iso = "2026-01-02T00:00:00Z";
    expect(formatManilaDate(new Date(iso))).toBe("Jan 2, 2026");
    expect(formatManilaDate(Date.parse(iso))).toBe("Jan 2, 2026");
  });

  it("does not change with the computer's own time zone", () => {
    // Midnight UTC is 08:00 in Manila, whatever zone the test machine uses.
    expect(formatManilaDateTime("2026-06-15T00:00:00Z")).toBe("Jun 15, 2026, 8:00 AM");
  });

  it("refuses an invalid date", () => {
    expect(() => formatManilaDate("not a date")).toThrow(RangeError);
  });
});
