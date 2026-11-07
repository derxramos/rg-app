"use client";

import { useEffect, useRef } from "react";

import { notify } from "@/components/ui/sonner";

// The name of the short-lived "flash" cookie. The server sets it, this component shows the message once.
export const SIGNED_OUT_FLASH_COOKIE = "rg_flash";

const MESSAGES: Record<string, string> = {
  signed_out: "You have been signed out.",
  account_deleted: "Your account was deleted.",
};

// After sign out (or after the account was deleted) the server loads the home page with a 30 second cookie.
// This shows the message as a toast (announced to screen readers) and deletes the cookie, so a page refresh
// does not show it again. The address is not changed on purpose: changing it would make the header load
// again and close the phone menu.
export function SignedOutNotice() {
  // React runs effects twice in development. Show the message only once.
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    const flash = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${SIGNED_OUT_FLASH_COOKIE}=`))
      ?.split("=")[1];
    const message = flash ? MESSAGES[flash] : undefined;
    if (!message) return;
    shown.current = true;
    document.cookie = `${SIGNED_OUT_FLASH_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    notify.success(message);
  }, []);

  return null;
}
