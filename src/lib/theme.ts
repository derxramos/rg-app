// Day and night mode. The choice is saved in the browser (localStorage), under this name.
// No cookie and no server work, so the pages stay static and fast.
export const THEME_STORAGE_KEY = "rg-theme";

export type Theme = "light" | "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

// What to show: the saved choice, or the phone/computer setting when nothing is saved yet.
export function resolveTheme(saved: string | null | undefined, systemPrefersDark: boolean): Theme {
  if (isTheme(saved)) return saved;
  return systemPrefersDark ? "dark" : "light";
}

export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

// A tiny script that runs BEFORE the page is painted, so the page never flashes light and then dark.
// It is written by us (no user text in it) and it is the same on every page. It cannot break the page:
// if the browser blocks storage, the "try" skips it and the light colors stay.
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var t=(s==="light"||s==="dark")?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;
