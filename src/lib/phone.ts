// Philippine mobile numbers. We store them as +63XXXXXXXXXX (10 digits after +63, the first is 9).

// Accepts: 9171234567, 09171234567, 639171234567, +639171234567 (spaces, dashes and brackets are ignored).
// Returns "+639171234567", or null when the number is not a valid Philippine mobile number.
export function normalizePhMobile(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, "");
  const match = /^(?:\+63|63|0)?(9\d{9})$/.exec(cleaned);
  return match ? `+63${match[1]}` : null;
}

// The last 4 digits, used with the tracking code. Expects a number already in +63 format.
export function phoneLast4(normalized: string): string {
  return normalized.slice(-4);
}
