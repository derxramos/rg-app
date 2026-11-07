// Checks the home page hero colors (the --hero-* tokens) and the orange button in src/app/globals.css.
// Text must be easy to read (4.5 to 1). In night mode every shape must be clearly visible on the page (1.5 to 1).
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

type Rgba = [number, number, number, number];

// "#rrggbb" or "rgba(r, g, b, a)" -> [r, g, b, a]. A gradient gives the list of its colors.
function colors(value: string): Rgba[] {
  const out: Rgba[] = [];
  for (const m of value.matchAll(
    /#([0-9a-f]{6})\b|rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/gi,
  )) {
    if (m[1]) {
      const n = m[1];
      out.push([
        parseInt(n.slice(0, 2), 16),
        parseInt(n.slice(2, 4), 16),
        parseInt(n.slice(4, 6), 16),
        1,
      ]);
    } else out.push([+m[2], +m[3], +m[4], m[5] === undefined ? 1 : +m[5]]);
  }
  return out;
}

const one = (value: string): Rgba => colors(value)[0];

// What the eye sees: the color laid over a solid background.
function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1) as Rgba;
}

function luminance([r, g, b]: Rgba): number {
  const ch = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("night hero: glass cards and flat circles", () => {
  const page = one(dark["surface-subtle"]); // the hero section background
  const bigCircle = over(one(dark["hero-peach"]), page);
  const smallCircle = over(one(dark["hero-teal"]), page);
  // A card can sit on the page or on the big circle. Check both.
  const cardOnPage = over(one(dark["hero-card"]), page);
  const cardOnCircle = over(one(dark["hero-card"]), bigCircle);

  it("uses the exact colors that were asked for", () => {
    expect(dark["hero-peach"]).toBe("#1e6b60");
    expect(dark["hero-teal"]).toBe("#2a8f82");
    expect(dark["hero-card"].replace(/\s/g, "")).toBe("rgba(20,45,45,0.7)");
    expect(dark["hero-card-border-top"].replace(/\s/g, "")).toBe("rgba(255,255,255,0.28)");
    expect(dark["hero-badge-fg"]).toBe("#fcd34d");
    expect(dark["hero-verified-fg"]).toBe("#a7f3d0");
  });

  it("is flat: no gradient, blur, filter or glow in the night hero colors or in the component", () => {
    for (const name of Object.keys(dark).filter((n) => n.startsWith("hero-")))
      expect(dark[name], name).not.toMatch(/gradient|blur|filter/i);
    const component = readFileSync(
      path.resolve(__dirname, "../../src/components/public/hero-art.tsx"),
      "utf8",
    );
    expect(component).not.toMatch(/backdrop|blur|filter|drop-shadow|gradient/i);
  });

  it("circles, cards and the dot are clearly visible against the page (1.5 to 1)", () => {
    expect(contrast(bigCircle, page), "big circle").toBeGreaterThanOrEqual(1.5);
    expect(contrast(smallCircle, page), "small circle").toBeGreaterThanOrEqual(1.5);
    expect(contrast(one(dark["hero-dot"]), page), "dot").toBeGreaterThanOrEqual(1.5);
    // The glass card is a dark see-through fill, so its EDGE does the work: the top border is brighter.
    const topEdge = over(one(dark["hero-card-border-top"]), cardOnPage);
    expect(contrast(topEdge, page), "card top edge on the page").toBeGreaterThanOrEqual(1.5);
    const sideEdge = over(one(dark["hero-card-border"]), cardOnPage);
    expect(contrast(sideEdge, page), "card side edge on the page").toBeGreaterThanOrEqual(1.5);
    // Where a card overlaps the big circle, the card must still look different from the circle.
    expect(contrast(cardOnCircle, bigCircle), "card on the big circle").toBeGreaterThanOrEqual(1.3);
  });

  it("the top border is brighter than the side border", () => {
    expect(colors(dark["hero-card-border-top"])[0][3]).toBeGreaterThan(
      colors(dark["hero-card-border"])[0][3],
    );
  });

  it("placeholder lines are visible on the card (on the page and on the circle)", () => {
    for (const card of [cardOnPage, cardOnCircle]) {
      expect(contrast(over(one(dark["hero-line-1"]), card), card)).toBeGreaterThanOrEqual(1.25);
      expect(contrast(over(one(dark["hero-line-2"]), card), card)).toBeGreaterThanOrEqual(1.25);
    }
  });

  it("labels are at least 4.5 to 1 and icons at least 3 to 1, on the page and on the circle", () => {
    for (const [where, card] of [
      ["page", cardOnPage],
      ["circle", cardOnCircle],
    ] as const) {
      const badge = over(one(dark["hero-badge-bg"]), card);
      expect(
        contrast(one(dark["hero-badge-fg"]), badge),
        `In progress on ${where}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(one(dark["hero-verified-fg"]), card),
        `Verified on ${where}`,
      ).toBeGreaterThanOrEqual(4.5);
      const checkBg = over(one(dark["hero-check-bg"]), card);
      expect(
        contrast(one(dark["hero-check-fg"]), checkBg),
        `check on ${where}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("day hero (not changed by the night colors)", () => {
  const card = one(light["hero-card"]);
  it("keeps the day colors", () => {
    expect(light["hero-badge-bg"]).toBe("#daf1ee");
    expect(light["hero-badge-fg"]).toBe("#0b5c52");
    expect(light["hero-verified-fg"]).toBe("#14532d");
    expect(light["hero-peach"]).toBe("#ffe8dc");
    expect(light["hero-teal"]).toBe("#e3f2ef");
  });

  it("labels are at least 4.5 to 1 and the check icon at least 3 to 1", () => {
    expect(
      contrast(one(light["hero-badge-fg"]), one(light["hero-badge-bg"])),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(one(light["hero-verified-fg"]), card)).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(one(light["hero-check-fg"]), one(light["hero-check-bg"])),
    ).toBeGreaterThanOrEqual(3);
  });

  it("placeholder lines can be seen on the card", () => {
    expect(contrast(one(light["hero-line-1"]), card)).toBeGreaterThanOrEqual(1.1);
    expect(contrast(one(light["hero-line-2"]), card)).toBeGreaterThanOrEqual(1.05);
  });
});

describe("hero text is never faded by the animation", () => {
  it("the label and icon keyframes do not use opacity", () => {
    const start = css.indexOf("@keyframes hero-verified");
    const end = css.indexOf("@keyframes hero-spin");
    expect(start).toBeGreaterThan(-1);
    // Only real declarations count (the comments may say the word).
    expect(css.slice(start, end)).not.toMatch(/opacitys*:/);
  });
});

describe("the one orange button", () => {
  it("white text is at least 4.5 to 1 on the button and on hover, in day and night mode", () => {
    for (const vars of [light, dark]) {
      const text = one(vars["on-cta"]);
      expect(contrast(text, one(vars["cta"]))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(text, one(vars["cta-hover"]))).toBeGreaterThanOrEqual(4.5);
    }
    expect(light["cta"]).toBe("#c2410c");
    expect(light["cta-hover"]).toBe("#9a3412");
    expect(light["on-cta"]).toBe("#ffffff");
  });
});
