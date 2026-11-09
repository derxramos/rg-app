"use client";

import { LogOut } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { cn, focusRing } from "@/lib/utils";

const OVERLAY_ID = "signing-out-overlay";

// Shows a full screen "Signing out..." message. It is added to the page directly (not through React state),
// because the menu that holds the button can close or re-render while the server works, and the message
// must stay on screen until the new page loads. It also blocks a second tap.
function showSigningOut() {
  if (document.getElementById(OVERLAY_ID)) return;
  const box = document.createElement("div");
  box.id = OVERLAY_ID;
  box.setAttribute("role", "status");
  box.setAttribute("aria-live", "polite");
  box.className =
    "fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background/90 text-foreground";
  box.innerHTML =
    '<span class="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent motion-reduce:animate-none" aria-hidden="true"></span>' +
    '<p class="text-lg font-bold">Signing out...</p>' +
    '<p class="text-sm text-muted-foreground">Please wait a moment.</p>';
  document.body.appendChild(box);
}

// Sign out is a plain form POST (never a link), so another website cannot sign someone out.
// Ending the session can take a few seconds, so as soon as the person taps the button we show the message.
// The form still posts the normal way and the server answers with a full page load.
export function SignOutForm({ variant }: { variant: "menu" | "button" | "phone" }) {
  // Coming back to this page from the browser cache must not keep the message on screen.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) document.getElementById(OVERLAY_ID)?.remove();
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <form
      method="post"
      action="/auth/sign-out"
      role={variant === "menu" ? "none" : undefined}
      className={variant === "phone" ? "w-full" : undefined}
      onSubmit={showSigningOut}
    >
      {variant === "menu" ? (
        <button
          type="submit"
          role="menuitem"
          className={cn(
            "flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold whitespace-nowrap text-foreground hover:bg-accent",
            focusRing,
          )}
        >
          <LogOut aria-hidden="true" className="size-4 shrink-0" />
          Sign out
        </button>
      ) : variant === "phone" ? (
        <Button
          type="submit"
          variant="ghost"
          className="min-h-11 w-full justify-start px-3 text-base whitespace-nowrap"
        >
          <LogOut aria-hidden="true" />
          Sign out
        </Button>
      ) : (
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="md:min-h-11 max-[379px]:w-11 max-[379px]:px-0"
        >
          <LogOut aria-hidden="true" />
          {/* On the narrowest phones only the icon is shown, so the header fits. Screen readers still read it. */}
          <span className="max-[379px]:sr-only">Sign out</span>
        </Button>
      )}
    </form>
  );
}
