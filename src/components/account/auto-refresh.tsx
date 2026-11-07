"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Keeps "My requests" up to date without a button: every minute, while the tab is open and in front,
// the page asks the server for fresh data. No extra service is needed, so it stays free.
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [router, seconds]);

  return null;
}
