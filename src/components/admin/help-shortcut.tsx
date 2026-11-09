"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// F1 opens the Help page. We stop the browser's own F1 help window, because it is not about this app.
// Phones have no F1 key, so the header also has a visible Help link.
export function HelpShortcut() {
  const router = useRouter();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "F1" || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      if (window.location.pathname !== "/admin/help") router.push("/admin/help");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
