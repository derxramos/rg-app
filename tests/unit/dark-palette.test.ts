// Checks the night mode colors in src/app/globals.css: text must be easy to read (WCAG AA, 4.5 to 1 for text,
// 3 to 1 for borders of inputs), and every light color name must also exist in the dark palette.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} block not found`).toBeGreaterThan(-1);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const vars: Record<string, string> = {};
  for (const match of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g))
    vars[match[1]] = match[2].trim();
  return vars;
}

const light = block(':root,\n[data-theme="light"]');
const dark = block(':root[data-theme="dark"]');

function luminance(hex: string): number {
  const n = hex.replace("#", "").slice(0, 6);
  const channel = (i: number) => {
    const v = parseInt(n.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const c = (name: string) => dark[name];

describe("night palette", () => {
  it("has a value for every light color name (nothing falls back to a light color)", () => {
    const skip = new Set(["background", "foreground"]);
    const missing = Object.keys(light).filter(
      (name) =>
        /^(surface|border|input-border|text|primary|brand|cta|on-|highlight|success|warning|danger|info|ring|overlay|status-)/.test(
          name,
        ) &&
        !(name in dark) &&
        !skip.has(name),
    );
    expect(missing).toEqual([]);
  });

  it("normal text is at least 4.5 to 1 on every surface", () => {
    for (const surface of ["surface", "surface-subtle", "surface-sunken", "card"]) {
      expect(contrast(c("text"), c(surface)), `text on ${surface}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c("text-muted"), c(surface)), `muted on ${surface}`).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(c("primary"), c(surface)), `primary on ${surface}`).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrast(c("primary-ink"), c(surface)),
        `primary-ink on ${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("buttons and soft colored boxes are readable", () => {
    expect(contrast(c("on-primary"), c("primary"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c("on-primary"), c("primary-hover"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c("on-brand-accent"), c("brand-accent"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c("on-highlight"), c("highlight"))).toBeGreaterThanOrEqual(4.5);
    for (const name of ["success", "warning", "danger", "info"]) {
      expect(contrast(c(`on-${name}`), c(name)), `on-${name}`).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(c(`${name}-ink`), c(`${name}-soft`)),
        `${name}-ink on soft`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(c("brand-accent-ink"), c("brand-accent-soft"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c("primary-ink"), c("primary-soft"))).toBeGreaterThanOrEqual(4.5);
  });

  it("every status badge is readable", () => {
    const names = Object.keys(dark)
      .filter((name) => name.startsWith("status-") && name.endsWith("-bg"))
      .map((name) => name.slice(0, -3));
    expect(names).toHaveLength(9);
    for (const name of names)
      expect(contrast(c(`${name}-fg`), c(`${name}-bg`)), name).toBeGreaterThanOrEqual(4.5);
  });

  it("input borders and the focus ring can be seen (3 to 1)", () => {
    expect(contrast(c("input-border"), c("surface"))).toBeGreaterThanOrEqual(3);
    expect(contrast(c("input-border"), c("card"))).toBeGreaterThanOrEqual(3);
    expect(contrast(c("ring"), c("surface"))).toBeGreaterThanOrEqual(3);
  });

  it("the page is the darkest layer and cards are lighter than the page", () => {
    expect(luminance(c("surface-subtle"))).toBeLessThan(luminance(c("surface")));
    expect(luminance(c("card"))).toBeGreaterThan(luminance(c("surface")));
  });
});
