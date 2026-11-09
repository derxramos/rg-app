import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import AdminLoading from "@/app/admin/(protected)/loading";
import { AdminShellSkeleton } from "@/components/admin/admin-shell-skeleton";
import {
  CardGridSkeleton,
  DashboardSkeleton,
  DetailSkeleton,
  FormSkeleton,
  ListSkeleton,
} from "@/components/admin/page-skeletons";

// Two loading layers in the admin area:
//   1. The first load or a hard refresh: the whole admin frame is a placeholder (AdminShellSkeleton).
//   2. A click on a menu item or link: a thin top bar (navigation-progress.tsx) plus a page-shaped placeholder
//      from the loading.tsx file. The placeholder has no spinner and no visible text.
// Every Skeleton is hidden from screen readers; one screen-reader-only "Loading page" is announced instead.
describe("the admin loading screens", () => {
  it("the page placeholder is announced to screen readers, with no visible Loading text or spinner", () => {
    const html = renderToStaticMarkup(createElement(AdminLoading));
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading page");
    expect(html).not.toContain("Loading...");
    expect(html).not.toContain("animate-spin");
  });
  it("every page shape is announced once and hides its gray blocks from screen readers", () => {
    for (const Shape of [
      DashboardSkeleton,
      ListSkeleton,
      CardGridSkeleton,
      DetailSkeleton,
      FormSkeleton,
    ]) {
      const html = renderToStaticMarkup(createElement(Shape));
      expect(html.match(/role="status"/g)).toHaveLength(1);
      expect(html).toContain('aria-hidden="true"');
    }
  });
  it("the first-load frame is announced and has the header and the logo", () => {
    const html = renderToStaticMarkup(createElement(AdminShellSkeleton));
    expect(html).toContain('role="status"');
    expect(html).toContain("<header");
    expect(html).toContain("Bookkeeping");
  });
  it("placeholders appear only after a short delay, so a fast page shows no gray flash", () => {
    const html = renderToStaticMarkup(createElement(AdminLoading));
    expect(html).toContain("animate-skeleton");
  });
  it("sits next to the protected layout, so it covers every admin menu page", () => {
    const dir = path.resolve(process.cwd(), "src/app/admin/(protected)");
    expect(existsSync(path.join(dir, "loading.tsx"))).toBe(true);
    expect(existsSync(path.join(dir, "layout.tsx"))).toBe(true);
  });
  it("the pages with their own shape have their own loading.tsx", () => {
    const dir = path.resolve(process.cwd(), "src/app/admin/(protected)");
    for (const sub of [
      "requests",
      "requests/[id]",
      "activity",
      "settings",
      "settings/users",
      "settings/services",
      "settings/services/[id]",
      "settings/payments",
      "settings/payments/[id]",
      "settings/site",
      "settings/files",
    ]) {
      expect(existsSync(path.join(dir, sub, "loading.tsx")), sub).toBe(true);
    }
  });
});
