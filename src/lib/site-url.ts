// The public address of the website, without a trailing slash.
// Set APP_BASE_URL in the environment (see .env.example). The fallback is for local work only.
export function getBaseUrl(): string {
  const set = process.env.APP_BASE_URL?.trim();
  // Vercel sets this by itself (for example my-site.vercel.app, with no https://).
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const value = set || (vercel ? `https://${vercel}` : "http://localhost:3000");
  return value.replace(/\/+$/, "");
}
