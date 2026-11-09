import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { cleanListQuery, requestHref, requestsListHref, settingsTrail } from "@/lib/crumbs";

describe("settingsTrail: the first step under Settings", () => {
  it("owner and admin get a link to Settings", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(settingsTrail(role)).toEqual([{ label: "Settings", href: "/admin/settings" }]);
    }
  });
  it("staff have no Settings page, so their trail never links to it", () => {
    expect(settingsTrail("staff")).toEqual([]);
  });
});

describe("the list address that travels to one request", () => {
  it("keeps the search, filters and page number", () => {
    const raw =
      "q=maria&status=under_review&service=abc&from=2026-11-01&to=2026-11-09&drafts=1&page=3";
    expect(requestsListHref(raw)).toBe(`/admin/requests?${cleanListQuery(raw)}`);
    const clean = new URLSearchParams(cleanListQuery(raw));
    expect(Object.fromEntries(clean)).toEqual({
      q: "maria",
      status: "under_review",
      service: "abc",
      from: "2026-11-01",
      to: "2026-11-09",
      drafts: "1",
      page: "3",
    });
  });
  it("drops every other word, so a made-up address cannot add its own", () => {
    expect(cleanListQuery("q=a&next=https://evil.example&redirect=/x&page=2")).toBe("q=a&page=2");
  });
  it("gives the plain list when there is nothing to keep, or the text is too long or empty", () => {
    expect(requestsListHref(undefined)).toBe("/admin/requests");
    expect(requestsListHref("")).toBe("/admin/requests");
    expect(requestsListHref("foo=bar")).toBe("/admin/requests");
    expect(requestsListHref(`q=${"x".repeat(101)}`)).toBe("/admin/requests");
    expect(requestsListHref("q=a&".repeat(200))).toBe("/admin/requests");
  });
  it("puts the list inside the link to one request, safely", () => {
    expect(requestHref("abc", "")).toBe("/admin/requests/abc");
    const href = requestHref("abc", "q=a b&status=submitted&page=2");
    const query = new URL(href, "http://x").searchParams.get("list");
    expect(new URLSearchParams(query!).get("q")).toBe("a b");
    expect(new URLSearchParams(query!).get("page")).toBe("2");
  });
});

describe("Breadcrumbs", () => {
  const trail = [
    { label: "Settings", href: "/admin/settings" },
    { label: "Payment methods", href: "/admin/settings/payments" },
    { label: "Edit GCash" },
  ];

  it("shows nothing for a page with fewer than two steps", () => {
    expect(
      renderToStaticMarkup(createElement(Breadcrumbs, { items: [{ label: "Services" }] })),
    ).toBe("");
    expect(renderToStaticMarkup(createElement(Breadcrumbs, { items: [] }))).toBe("");
  });
  it("is a labelled navigation with the parents as links and the current page marked", () => {
    const html = renderToStaticMarkup(createElement(Breadcrumbs, { items: trail }));
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('href="/admin/settings"');
    expect(html).toContain('href="/admin/settings/payments"');
    expect(html).toContain('aria-current="page"');
    // The current page is text, not a link.
    expect(html).not.toContain('href="/admin/settings/payments/');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
  it("gives a phone one big link to the parent page", () => {
    const html = renderToStaticMarkup(createElement(Breadcrumbs, { items: trail }));
    expect(html).toContain('aria-label="Back to Payment methods"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("sm:hidden");
  });
  it("cuts a long name and keeps the full text in the tooltip", () => {
    const longName = "Maria Cristina Dela Cruz-Santos de los Reyes Villanueva Jr III";
    const html = renderToStaticMarkup(
      createElement(Breadcrumbs, {
        items: [{ label: "Requests", href: "/admin/requests" }, { label: longName }],
      }),
    );
    expect(html).toContain(`title="${longName}"`);
    expect(html).toContain("truncate");
  });
  it("a staff trail that starts at Services still goes back to the Services list", () => {
    const html = renderToStaticMarkup(
      createElement(Breadcrumbs, {
        items: [
          ...settingsTrail("staff"),
          { label: "Services", href: "/admin/settings/services" },
          { label: "Sample service" },
        ],
      }),
    );
    expect(html).toContain('href="/admin/settings/services"');
    expect(html).not.toContain('href="/admin/settings"');
  });
});
