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

// Viber is shown as a number, not a link (the viber:// link does nothing on many devices).
// The setting may hold a viber://chat?number=... link or just a phone number. Returns text to show, or null.
export function viberDisplayNumber(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  let raw = trimmed;
  if (/^viber:/i.test(trimmed)) {
    try {
      raw = new URL(trimmed).searchParams.get("number") ?? "";
    } catch {
      return null;
    }
  }

  // Only digits, spaces, + - ( ) are allowed, so nothing odd is ever shown.
  if (!/^\+?[\d\s()-]{7,20}$/.test(raw)) return null;

  const digits = raw.replace(/\D/g, "");
  // A Philippine mobile number (63 + 10 digits) is shown with spaces so it is easy to read.
  if (digits.length === 12 && digits.startsWith("63")) {
    const n = digits.slice(2);
    return `+63 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  return raw.trim();
}

// Builds the "You can also write to us on ..." sentence from the channels that are really set.
// Returns null when no channel is set, so the page shows no sentence at all.
export function contactChannelSentence(channels: { messenger: boolean; viber: boolean }): string | null {
  const names = [channels.messenger ? "Messenger" : null, channels.viber ? "Viber" : null].filter(
    (name): name is string => name !== null,
  );
  if (names.length === 0) return null;
  return `You can also write to us on ${names.join(" or ")}.`;
}
