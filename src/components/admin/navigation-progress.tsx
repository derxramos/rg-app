"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FILE_TIMEOUT_MS, PAGE_TIMEOUT_MS, formKind, navigationKind } from "@/lib/nav-progress";

// One loading indicator for the whole admin area: a thin bar at the top and a small "Loading..." label. It shows
// as soon as a person clicks a link, a card, a pagination button, or sends a search or filter form, so they know
// the page is asking the server for data. It goes away when the address changes (the new page arrived).
// Buttons that save something (ActionForm, the row menus) show their own spinner inside the button.
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

  if (startedAt === null || startedAt !== here) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60]"
    >
      <div
        aria-hidden="true"
        className="h-1 w-full animate-pulse bg-primary motion-reduce:animate-none"
      />
      <div className="mx-auto mt-3 flex w-fit items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-md">
        <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
        Loading...
      </div>
    </div>
  );
}
