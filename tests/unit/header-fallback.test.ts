import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AUTH_HINT_COOKIE, AUTH_HINT_SCRIPT } from "@/components/shared/auth-hint";
import { HeaderAuthFallback } from "@/components/shared/header-auth";

// The header must never be an empty gap while the login is read (a refresh, a slow connection).
describe("header placeholder while the login is read", () => {
  for (const layout of ["bar", "menu"] as const) {
    it(`${layout}: has a working Sign in link, hidden only when the browser was signed in last time`, () => {
      const html = renderToStaticMarkup(createElement(HeaderAuthFallback, { layout }));
      expect(html).toContain('href="/login"');
      expect(html).toContain("Sign in");
      // Hidden by the hint set on <html>, and a neutral box takes its place for a signed in person.
      expect(html).toContain("[html[data-signed-in]_&amp;]:hidden");
      expect(html).toContain("[html[data-signed-in]_&amp;]:block");
    });
  }

  it("the hint script only reads a cookie and sets one attribute", () => {
    expect(AUTH_HINT_SCRIPT).toContain(AUTH_HINT_COOKIE);
    expect(AUTH_HINT_SCRIPT).toContain('"data-signed-in"');
    expect(AUTH_HINT_SCRIPT).not.toMatch(/fetch|XMLHttpRequest|localStorage/);
  });
});
