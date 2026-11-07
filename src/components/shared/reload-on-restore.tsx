"use client";

import { useEffect } from "react";

// Put this on private pages (admin, account). When the browser brings a page back from its back/forward
// cache (the Back button after sign out), the old page would show again without asking the server.
// This reloads it, so the server answers again: a signed-out person is sent to the login page.
export function ReloadOnRestore() {
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  return null;
}
