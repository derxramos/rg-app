import { describe, expect, it } from "vitest";

import {
  LEGAL_BODY_MAX,
  builtInLegalVersion,
  checkLegalBody,
  cleanLegalBody,
  fillLegalText,
  hasMissingParts,
  isLegalKind,
  nextLegalVersion,
} from "./legal-text";

const facts = { retentionDays: 45, contactEmail: "", contactPhone: "" };

describe("fillLegalText", () => {
  it("fills in the retention days (every place) and leaves the other words alone", () => {
    const text = fillLegalText(
      "privacy",
      "Kept {{retention_days}} days. Again: {{retention_days}}. {{other}}",
      facts,
    );
    expect(text).toBe("Kept 45 days. Again: 45. {{other}}");
  });
  it("fills in the contact lines with the words of each document", () => {
    const both = {
      ...facts,
      contactEmail: "zolb-test+x@example.com",
      contactPhone: "+63 900 000 0000",
    };
    expect(fillLegalText("privacy", "{{contact_lines}}", both)).toBe(
      "- Email: zolb-test+x@example.com\n- Phone: +63 900 000 0000",
    );
    expect(fillLegalText("terms", "{{contact_lines}}", both)).toContain(
      "- Phone, Viber: +63 900 000 0000",
    );
  });
  it("has a fallback line when there are no contact details", () => {
    expect(fillLegalText("privacy", "{{contact_lines}}", facts)).toContain("[Contact person");
    expect(fillLegalText("terms", "{{contact_lines}}", facts)).toContain("Contact page");
  });
});

describe("versions", () => {
  it("starts at .1 on a new day and counts up, ignoring other days and bad text", () => {
    expect(nextLegalVersion("2026-11-09", [])).toBe("2026-11-09.1");
    expect(nextLegalVersion("2026-11-09", ["2026-11-08.7", "2026-11-09.1", "2026-11-09.2"])).toBe(
      "2026-11-09.3",
    );
    expect(nextLegalVersion("2026-11-09", ["2026-11-09.x", "2.0 draft"])).toBe("2026-11-09.1");
  });
  it("labels the built-in text with .0, so it never collides with a saved version", () => {
    expect(builtInLegalVersion("2026-11-06")).toBe("2026-11-06.0");
    expect(nextLegalVersion("2026-11-06", [builtInLegalVersion("2026-11-06")])).toBe(
      "2026-11-06.1",
    );
  });
});

describe("text checks", () => {
  it("finds parts that are not filled in, but not normal links", () => {
    expect(hasMissingParts("Call [Contact person to be added].")).toBe(true);
    expect(hasMissingParts("See [our page](https://example.com).")).toBe(false);
    expect(hasMissingParts("Nothing missing here.")).toBe(false);
  });
  it("cleans line endings and the edges", () => {
    expect(cleanLegalBody("  a\r\nb\rc  \n")).toBe("a\nb\nc");
  });
  it("accepts a normal length and refuses too short or too long text", () => {
    expect(checkLegalBody("x".repeat(300))).toBeNull();
    expect(checkLegalBody("short")).toMatch(/too short/);
    expect(checkLegalBody("x".repeat(LEGAL_BODY_MAX + 1))).toMatch(/too long/);
  });
  it("knows the two kinds", () => {
    expect(isLegalKind("privacy")).toBe(true);
    expect(isLegalKind("terms")).toBe(true);
    expect(isLegalKind("cookies")).toBe(false);
    expect(isLegalKind(undefined)).toBe(false);
  });
});
