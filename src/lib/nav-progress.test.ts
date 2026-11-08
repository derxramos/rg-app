import { describe, expect, it } from "vitest";

import { formKind, navigationKind } from "./nav-progress";

const now = "https://site.example/admin/requests?page=2";
const click = (href: string, extra: Record<string, unknown> = {}) =>
  navigationKind({ href, currentUrl: now, ...extra });

describe("navigationKind", () => {
  it("a link to another admin page, or to another page of the same list, shows the indicator", () => {
    expect(click("/admin/settings")).toBe("page");
    expect(click("https://site.example/admin/requests?page=3")).toBe("page");
    expect(click("/admin/requests?status=submitted")).toBe("page");
    expect(click("/admin/requests/123")).toBe("page");
  });
  it("shows nothing for the same address, an #anchor, another website or a new tab", () => {
    expect(click("/admin/requests?page=2")).toBeNull();
    expect(click("/admin/requests?page=2#top")).toBeNull();
    expect(click("https://other.example/admin")).toBeNull();
    expect(click("/admin/settings", { target: "_blank" })).toBeNull();
    expect(click("/admin/settings", { modified: true })).toBeNull();
    expect(click("mailto:someone@example.com")).toBeNull();
  });
  it("a download or a server route is a short 'file' indicator", () => {
    expect(click("/api/admin/export?type=requests")).toBe("file");
    expect(click("/api/admin/activity-export?days=180", { download: true })).toBe("file");
    expect(click("/auth/sign-out")).toBe("file");
  });
  it("never throws on a bad address", () => {
    expect(navigationKind({ href: "http://[", currentUrl: now })).toBeNull();
  });
});

describe("formKind", () => {
  it("a search or filter form is a page, and the export and sign out forms are files", () => {
    expect(
      formKind({ method: "get", action: "https://site.example/admin/requests", currentUrl: now }),
    ).toBe("page");
    expect(
      formKind({ method: "get", action: "https://site.example/api/admin/export", currentUrl: now }),
    ).toBe("file");
    expect(
      formKind({ method: "post", action: "https://site.example/auth/sign-out", currentUrl: now }),
    ).toBe("file");
  });
});
