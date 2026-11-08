import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import AdminLoading from "@/app/admin/(protected)/loading";

// Every admin page (Dashboard, Requests, Settings, Activity, Export and everything below) is under this folder, so
// Next.js shows this file at once while a page loads. The menu and header (the layout) stay in place.
describe("the admin loading screen", () => {
  it("is announced to screen readers and says Loading", () => {
    const html = renderToStaticMarkup(createElement(AdminLoading));
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading...");
  });
  it("sits next to the protected layout, so it covers every admin menu page", () => {
    const dir = path.resolve(process.cwd(), "src/app/admin/(protected)");
    expect(existsSync(path.join(dir, "loading.tsx"))).toBe(true);
    expect(existsSync(path.join(dir, "layout.tsx"))).toBe(true);
  });
});
