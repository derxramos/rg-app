import "server-only";

// Small helpers for reading environment variables on the server.

export const isProduction = () => process.env.NODE_ENV === "production";

// The secret used to sign cookies and hash tokens and IP addresses.
// In production it MUST be set. In development a fixed text is used so the app starts without setup.
export function getTokenSecret(): string {
  const secret = process.env.TOKEN_HASH_SECRET?.trim();
  if (secret) return secret;
  if (isProduction()) throw new Error("TOKEN_HASH_SECRET is not set.");
  return "development-only-secret-do-not-use-in-production";
}
