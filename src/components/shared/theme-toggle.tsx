"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { THEME_STORAGE_KEY, isTheme, otherTheme, type Theme } from "@/lib/theme";

// The page theme lives in the data-theme attribute on <html> (the early script in the root layout sets it
// before the first paint). This button reads and changes that attribute, and saves the choice in the browser.
function readTheme(): Theme {
  const value = document.documentElement.getAttribute("data-theme");
  return isTheme(value) ? value : "light";
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  // Another tab changed the choice.
  window.addEventListener("storage", onChange);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onChange);
  };
}

// Day / night button. It shows the icon of the mode you will switch TO (a moon in day mode, a sun in night mode).
// The words are for screen readers. Sizes follow the other header buttons (44 px tap target on phones).
export function ThemeToggle({
  className,
  labelled = false,
}: {
  className?: string;
  // A full width list item with words (for the phone menu), instead of an icon button.
  labelled?: boolean;
}) {
  // On the server we do not know the theme yet, so we start as "light". The browser fixes it right after
  // load. The label text is the only thing that can differ for a moment.
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as Theme);
  const next = otherTheme(theme);

  function toggle() {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage is blocked: the choice lasts only until the page is closed.
    }
  }

  if (labelled) {
    return (
      <Button
        type="button"
        variant="ghost"
        className={cn("min-h-11 w-full justify-start px-3 text-base whitespace-nowrap", className)}
        onClick={toggle}
        aria-label={next === "dark" ? "Switch to night mode" : "Switch to day mode"}
      >
        {next === "dark" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
        {next === "dark" ? "Night mode" : "Day mode"}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn("md:size-10", className)}
      onClick={toggle}
      aria-label={next === "dark" ? "Switch to night mode" : "Switch to day mode"}
      title={next === "dark" ? "Night mode" : "Day mode"}
    >
      {next === "dark" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
    </Button>
  );
}
