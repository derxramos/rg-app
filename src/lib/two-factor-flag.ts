// Reads the ADMIN_REQUIRE_2FA setting. Server use only: never give this a NEXT_PUBLIC_ name.
// This file has no imports, so the startup hook (src/instrumentation.ts) can use it safely.
//
// 2FA is required unless the value is exactly the word "false" (spaces and capital letters are ignored).
// A missing, empty or any other value ("0", "no", "off", "true") means 2FA is REQUIRED. This is the safe default.
export function isTwoFactorRequired(value: string | undefined): boolean {
  return value?.trim().toLowerCase() !== "false";
}
