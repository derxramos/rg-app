// The public address of the website, without a trailing slash.
// Set APP_BASE_URL in the environment (see .env.example). The fallback is for local work only.
export function getBaseUrl(): string {
  const value = process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
  return value.replace(/\/+$/, "");
}
