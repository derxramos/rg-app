// The short name for the header account button: the first word of the full name, or "Account" when there is none.
// The small circle shows the first letter (a letter with accents or an emoji counts as one letter).
export function displayName(fullName: string | null | undefined): {
  name: string;
  initial: string;
} {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first) return { name: "Account", initial: "A" };
  return { name: first, initial: Array.from(first)[0].toUpperCase() };
}
