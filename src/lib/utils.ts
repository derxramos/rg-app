import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Joins class names and removes Tailwind classes that clash with each other.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Focus ring from docs/DESIGN_SYSTEM.md: 2 px ring color with a 2 px gap. Never remove it.
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
