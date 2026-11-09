"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { helpTopicForPath } from "@/lib/help-content";

// F1 opens the Help page, with the group for the current screen open first. We stop the browser's own F1 help
// window, because it is not about this app. Phones have no F1 key, so the header also has a visible Help link.
export function HelpShortcut() {
  const router = useRouter();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "F1" || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      const path = window.location.pathname;
      if (path === "/admin/help") return;
      const topic = helpTopicForPath(path);
      router.push(topic ? `/admin/help?topic=${topic}` : "/admin/help");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
