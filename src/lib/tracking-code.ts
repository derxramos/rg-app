import { randomInt } from "node:crypto";

// Tracking code: "RG-" + 8 characters from 31 characters with no look-alikes (no 0, O, 1, I, L).
// 31^8 is about 850 billion combinations. Docs: SECURITY_AND_PRIVACY.md T3.
export const TRACKING_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const TRACKING_CODE_PATTERN = /^RG-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

export function generateTrackingCode(random: (max: number) => number = randomInt): string {
  let code = "RG-";
  for (let i = 0; i < 8; i++) code += TRACKING_ALPHABET[random(TRACKING_ALPHABET.length)];
  return code;
}

// People type codes on phones. Accept lower case, and spaces or dashes in the wrong places.
export function normalizeTrackingCode(input: string): string {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = compact.startsWith("RG") ? compact.slice(2) : compact;
  return `RG-${body}`;
}
