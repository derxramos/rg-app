"use client";

import { useEffect, useRef } from "react";

import { notify } from "@/components/ui/sonner";

// The name of the short-lived "flash" cookie that POST /auth/sign-out sets (it only says "show the message once").
export const SIGNED_OUT_FLASH_COOKIE = "rg_flash";

// After sign out the server loads the home page with a 30 second cookie. This shows
// "You have been signed out." as a toast (announced to screen readers) and deletes the cookie, so a
// page refresh does not show it again. The address is not changed on purpose: changing it would make
// the header load again and close the phone menu.
export function SignedOutNotice() {
  // React runs effects twice in development. Show the message only once.
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    const hasFlash = document.cookie
      .split("; ")
      .some((part) => part === `${SIGNED_OUT_FLASH_COOKIE}=signed_out`);
    if (!hasFlash) return;
    shown.current = true;
    document.cookie = `${SIGNED_OUT_FLASH_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    notify.success("You have been signed out.");
  }, []);

  return null;
}
