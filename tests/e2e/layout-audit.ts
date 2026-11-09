// The layout checker. It runs INSIDE the page (page.evaluate) and returns a list of problems.
// Types: (a) the whole page scrolls sideways, (b) a box goes outside its card or container,
// (c) two siblings overlap, (d) text is cut off, (e) a tap target is smaller than 44 px (phones only).
// Intended "..." cut-offs (text-overflow: ellipsis) are reported as "d-ellipsis" only when they have no
// full-text tooltip (title attribute), so they are checked separately from real cut-offs.
import type { Page } from "@playwright/test";

export type LayoutProblem = {
  type: "a" | "b" | "c" | "d" | "d-ellipsis" | "e";
  element: string;
  detail: string;
};

export async function auditPage(page: Page, options: { phone: boolean }): Promise<LayoutProblem[]> {
  return page.evaluate((opts) => {
    const problems: { type: string; element: string; detail: string }[] = [];
    const seen = new Set<string>();
    const add = (type: string, el: Element, detail: string) => {
      const name = describe(el);
      const key = type + "|" + name + "|" + detail;
      if (seen.has(key) || problems.length > 80) return;
      seen.add(key);
      problems.push({ type, element: name, detail });
    };

    function describe(el: Element): string {
      const parts: string[] = [];
      let node: Element | null = el;
      for (let i = 0; node && i < 3 && node !== document.body; i++, node = node.parentElement) {
        const slot = node.getAttribute("data-slot");
        const cls = (node.getAttribute("class") ?? "").split(/\s+/).slice(0, 3).join(".");
        parts.unshift(
          node.tagName.toLowerCase() + (slot ? `[${slot}]` : "") + (cls ? "." + cls : ""),
        );
      }
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return parts.join(" > ") + (text ? ` "${text}"` : "");
    }

    const isHidden = (el: Element) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") return true;
      const r = el.getBoundingClientRect();
      return r.width === 0 || r.height === 0;
    };
    const isOutOfFlow = (el: Element) => {
      const p = getComputedStyle(el).position;
      return p === "fixed" || p === "absolute" || p === "sticky";
    };
    const clipsX = (el: Element) => {
      const o = getComputedStyle(el).overflowX;
      return o !== "visible";
    };
    // A real box: has a border or a background. Used as the "card" a child must stay inside.
    const isBox = (el: Element) => {
      const s = getComputedStyle(el);
      const hasBorder = parseFloat(s.borderLeftWidth) > 0 || parseFloat(s.borderRightWidth) > 0;
      const hasBg = s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent";
      return hasBorder || hasBg;
    };

    // (a) the whole page scrolls sideways
    const root = document.scrollingElement!;
    if (root.scrollWidth > window.innerWidth + 1) {
      add(
        "a",
        document.body,
        `page is ${root.scrollWidth}px wide, window is ${window.innerWidth}px`,
      );
    }

    const all = Array.from(document.body.querySelectorAll("*")).filter(
      (el) =>
        !isHidden(el) &&
        !el.closest(
          "[class*='sr-only'], nextjs-portal, [data-nextjs-toast], [data-next-badge-root], svg, [aria-hidden='true'] svg",
        ),
    );

    for (const el of all) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);

      // (b) a box goes outside the nearest card or container
      if (!isOutOfFlow(el) && el.tagName !== "TR" && el.tagName !== "TD" && el.tagName !== "TH") {
        let anc = el.parentElement;
        let skip = false;
        while (anc && anc !== document.body) {
          if (clipsX(anc)) {
            skip = true; // inside a scroll area: it may scroll on purpose
            break;
          }
          if (isBox(anc)) break;
          anc = anc.parentElement;
        }
        if (!skip && anc && anc !== document.body) {
          const a = anc.getBoundingClientRect();
          if (r.right > a.right + 1 || r.left < a.left - 1) {
            add(
              "b",
              el,
              `box ${Math.round(r.left)}..${Math.round(r.right)} is outside ${describe(anc)} ${Math.round(a.left)}..${Math.round(a.right)}`,
            );
          }
        }
        // its own content is wider than its box (text pushed out of a pill, a button, ...)
        const he = el as HTMLElement;
        if (
          style.overflowX === "visible" &&
          he.clientWidth > 0 &&
          he.scrollWidth > he.clientWidth + 1 &&
          !["HTML", "BODY"].includes(el.tagName) &&
          !(el.tagName === "INPUT" || el.tagName === "TEXTAREA") &&
          getComputedStyle(el).display !== "inline"
        ) {
          add("b", el, `content is ${he.scrollWidth}px in a box of ${he.clientWidth}px`);
        }
      }

      // (d) text is cut off
      const he = el as HTMLElement;
      if (
        style.overflowX !== "visible" &&
        style.overflowX !== "auto" &&
        style.overflowX !== "scroll"
      ) {
        const cutX = he.scrollWidth > he.clientWidth + 1;
        const cutY = style.overflowY !== "visible" && he.scrollHeight > he.clientHeight + 1;
        if ((cutX || cutY) && (el.textContent ?? "").trim() !== "" && !(el.tagName === "INPUT")) {
          if (
            style.textOverflow === "ellipsis" ||
            (style.getPropertyValue("-webkit-line-clamp") || "none") !== "none"
          ) {
            const hasTip = el.hasAttribute("title") || !!el.closest("[title]");
            if (!hasTip)
              add("d-ellipsis", el, "text is shortened with ... but has no tooltip (title)");
          } else {
            add(
              "d",
              el,
              `text is cut off (${he.scrollWidth}x${he.scrollHeight} in ${he.clientWidth}x${he.clientHeight})`,
            );
          }
        }
      }

      // (e) tap targets on phones
      if (opts.phone) {
        const isControl =
          el.matches(
            "button, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, [role=button], [role=tab], [role=menuitem]",
          ) ||
          (el.matches("a[href]") && style.display !== "inline");
        // A control inside a label or a wrapper that is itself 44 px tall is fine (the whole label is the tap area).
        const holder = el.closest("label, [data-slot=input-with-prefix], [input-with-prefix]");
        const holderOk = holder ? holder.getBoundingClientRect().height >= 43.5 : false;
        if (
          isControl &&
          !holderOk &&
          !el.closest("[aria-hidden='true']") &&
          !(el as HTMLInputElement).disabled
        ) {
          if (r.height < 43.5 || r.width < 43.5) {
            // A control that sits inside a bigger tap area (a label or a link) is fine.
            add("e", el, `tap target is ${Math.round(r.width)}x${Math.round(r.height)} px`);
          }
        }
      }
    }

    // (c) siblings that overlap
    const parents = new Set<Element>();
    for (const el of all) if (el.parentElement) parents.add(el.parentElement);
    for (const parent of parents) {
      const kids = Array.from(parent.children).filter(
        (k) =>
          !isHidden(k) &&
          !isOutOfFlow(k) &&
          getComputedStyle(k).display !== "inline" &&
          !k.matches("nextjs-portal, script, style, col, colgroup") &&
          getComputedStyle(k).display !== "contents",
      );
      if (kids.length < 2 || kids.length > 80) continue;
      for (let i = 0; i < kids.length; i++) {
        const A = kids[i].getBoundingClientRect();
        for (let j = i + 1; j < kids.length; j++) {
          const B = kids[j].getBoundingClientRect();
          const w = Math.min(A.right, B.right) - Math.max(A.left, B.left);
          const h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
          if (w > 1.5 && h > 1.5) {
            // Negative margins or overlaps that are drawn on purpose do not happen in this app.
            add(
              "c",
              kids[i],
              `overlaps sibling ${describe(kids[j])} by ${Math.round(w)}x${Math.round(h)} px`,
            );
          }
        }
      }
    }
    return problems;
  }, options) as Promise<LayoutProblem[]>;
}
