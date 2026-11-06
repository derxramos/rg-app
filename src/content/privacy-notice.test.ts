import { describe, expect, it } from "vitest";

import { buildPrivacyNotice } from "./privacy-notice";

const base = { retentionDays: 30, contactEmail: "", contactPhone: "" };

describe("buildPrivacyNotice", () => {
  it("uses the file retention days from the settings", () => {
    expect(buildPrivacyNotice({ ...base, retentionDays: 45 })).toContain(
      "deleted 45 days after your request is Completed or Cancelled",
    );
  });

  it("says drafts are deleted after 7 days", () => {
    expect(buildPrivacyNotice(base)).toContain("after 7 days");
  });

  it("says the receipt image is never kept", () => {
    expect(buildPrivacyNotice(base)).toMatch(
      /do \*\*not\*\* keep a picture of your payment receipt/,
    );
  });

  it("shows the contact details when they are set", () => {
    const text = buildPrivacyNotice({
      ...base,
      contactEmail: "zolb-test+business@example.com",
      contactPhone: "+63 900 000 0000",
    });
    expect(text).toContain("- Email: zolb-test+business@example.com");
    expect(text).toContain("- Phone: +63 900 000 0000");
    expect(text).not.toContain("[Contact person and contact details to be added by the owner]");
  });

  it("has the chosen record keeping time and data region, and marks a missing contact for the owner", () => {
    const text = buildPrivacyNotice(base);
    expect(text).toContain("[Contact person and contact details to be added by the owner]");
    expect(text).toContain("5 years (for tax and business records)");
    expect(text).toContain("Singapore");
  });

  it("does not use any agency logo or name as a service provider", () => {
    // Names such as BIR or SSS must stay out of this notice. It is only about our own data handling.
    expect(buildPrivacyNotice(base)).not.toMatch(/\b(BIR|SSS|PhilHealth|Pag-IBIG)\b/);
  });
});
