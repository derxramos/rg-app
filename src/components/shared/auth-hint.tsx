"use client";

import { useEffect } from "react";

// A small hint cookie that only says "this browser was signed in last time". It holds no private data and is never
// used to decide what a person may do (the server always reads the real login). It lets the header show the right
// placeholder while the page loads: "Sign in" for a visitor, a neutral box for someone who was signed in.
// The cookie is read by a tiny script in the root layout (AUTH_HINT_SCRIPT) before the first paint.
export const AUTH_HINT_COOKIE = "rg_hint";

export function AuthHint({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = signedIn
      ? `${AUTH_HINT_COOKIE}=1; path=/; max-age=2592000; samesite=lax${secure}`
      : `${AUTH_HINT_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
    document.documentElement.toggleAttribute("data-signed-in", signedIn);
  }, [signedIn]);
  return null;
}

export const AUTH_HINT_SCRIPT = `try{if(/(^|; )${AUTH_HINT_COOKIE}=1/.test(document.cookie))document.documentElement.setAttribute("data-signed-in","")}catch(e){}`;
