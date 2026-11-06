// Contact links come from site settings, which the owner can edit.
// We only accept link types we expect, so a bad value (for example "javascript:...") never becomes a link.

const ALLOWED_PROTOCOLS = new Set(["https:", "viber:"]);

// Returns the clean link, or null when the value is empty or not safe to show.
export function safeContactUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
