"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FILE_TIMEOUT_MS, PAGE_TIMEOUT_MS, formKind, navigationKind } from "@/lib/nav-progress";

// The "click received" signal for the whole admin area: ONE thin progress bar at the top of the window (the same
// pattern as YouTube, GitHub and Linear). It starts at once when a person clicks a link, a card, a pagination
// button, or sends a search or filter form (no delay, because feedback to a click must feel instant), moves
// forward slowly while the server answers, then fills up and fades out when the new page arrives.
// The page-shaped gray placeholders (loading.tsx files) are the second signal: they show what is coming, but only
// after 200 ms, so a fast page shows only this bar. There is no "Loading..." text here on purpose.
// Buttons that save something (ActionForm, the row menus) show their own spinner inside the button.
// How long the bar takes to fill and fade when the page arrives (keep in step with --animate-nav-progress-done).
const FINISH_MS = 400;

export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = `${pathname}?${search}`;
  // The address at the moment of the click. The indicator is on while we are still at that address, so it
  // switches itself off as soon as the new page arrives (no effect needed).
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const hereRef = useRef(here);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    hereRef.current = here;
  }, [here]);

  // The new page arrived (the address changed): let the bar fill and fade for a moment, then remove it.
  useEffect(() => {
    if (startedAt === null || startedAt === here) return;
    const done = setTimeout(() => setStartedAt(null), FINISH_MS);
    return () => clearTimeout(done);
  }, [startedAt, here]);

  useEffect(() => {
    const stop = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setStartedAt(null);
    };
    const start = (kind: "page" | "file") => {
      if (timer.current) clearTimeout(timer.current);
      setStartedAt(hereRef.current);
      // A safety net: the indicator never stays on for ever (a slow network, an error, a download).
      timer.current = setTimeout(stop, kind === "file" ? FILE_TIMEOUT_MS : PAGE_TIMEOUT_MS);
    };
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      const anchor = (event.target as Element | null)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const kind = navigationKind({
        href: anchor.href,
        currentUrl: window.location.href,
        target: anchor.target,
        download: anchor.hasAttribute("download"),
        modified:
          event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey,
      });
      if (kind) start(kind);
    }
    function onSubmit(event: SubmitEvent) {
      const form = event.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;
      // Forms handled by our own code (ActionForm calls preventDefault) show their own spinner.
      // The check runs after the form's own handlers, so a prevented submit is skipped.
      setTimeout(() => {
        if (event.defaultPrevented) return;
        const current = window.location.href;
        // A GET form goes to its address plus what was typed. If that is the address we are on, nothing will load.
        if (form.method.toLowerCase() === "get") {
          const target = new URL(form.action, current);
          const data = new FormData(form);
          target.search = "";
          for (const [name, value] of data.entries())
            if (typeof value === "string") target.searchParams.append(name, value);
          if (navigationKind({ href: target.href, currentUrl: current }) === null) return;
        }
        start(formKind({ method: form.method, action: form.action, currentUrl: current }));
      }, 0);
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (startedAt === null) return null;
  const arrived = startedAt !== here;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]"
    >
      {arrived ? null : <span className="sr-only">Loading page</span>}
      {/* Moves with "scale" only, so the browser can run it on the graphics card. With "reduce motion" it is a
          still bar that disappears when the page arrives. */}
      <div
        aria-hidden="true"
        className={
          arrived
            ? "h-full origin-left bg-primary motion-safe:animate-nav-progress-done motion-reduce:opacity-0"
            : "h-full origin-left bg-primary motion-safe:animate-nav-progress"
        }
      />
    </div>
  );
}
