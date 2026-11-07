import { describe, expect, it } from "vitest";

import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY, isTheme, otherTheme, resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("uses the saved choice first", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the device setting when nothing (or something strange) is saved", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(undefined, false)).toBe("light");
    expect(resolveTheme("purple", true)).toBe("dark");
  });
});

describe("theme helpers", () => {
  it("knows the two themes and flips between them", () => {
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("alt")).toBe(false);
    expect(otherTheme("light")).toBe("dark");
    expect(otherTheme("dark")).toBe("light");
  });

  it("has an early script that reads the same storage key and is valid JavaScript", () => {
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
    expect(() => new Function(THEME_INIT_SCRIPT)).not.toThrow();
  });

  it("the early script sets data-theme from the saved value or the device setting", () => {
    const run = (saved: string | null, dark: boolean) => {
      const attrs: Record<string, string> = {};
      const fake = {
        localStorage: { getItem: () => saved },
        matchMedia: () => ({ matches: dark }),
        document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } },
      };
      new Function("localStorage", "window", "document", THEME_INIT_SCRIPT)(
        fake.localStorage,
        { matchMedia: fake.matchMedia },
        fake.document,
      );
      return attrs["data-theme"];
    };
    expect(run("dark", false)).toBe("dark");
    expect(run("light", true)).toBe("light");
    expect(run(null, true)).toBe("dark");
    expect(run(null, false)).toBe("light");
  });
});
