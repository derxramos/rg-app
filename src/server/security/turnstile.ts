import "server-only";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type VerifyOptions = {
  token: string | null | undefined;
  ip?: string | null;
  secret?: string | undefined;
  fetchImpl?: typeof fetch;
  production?: boolean;
};

// Asks Cloudflare if the Turnstile token is good. The server must ALWAYS do this: a token that is
// only checked in the browser proves nothing. A token works once and for 5 minutes.
// In development, with no secret key set, the check is skipped so the forms can be tried locally.
export async function verifyTurnstile(options: VerifyOptions): Promise<boolean> {
  const secret = options.secret ?? process.env.TURNSTILE_SECRET_KEY?.trim();
  const production = options.production ?? process.env.NODE_ENV === "production";

  if (!secret) {
    if (production) {
      console.error("TURNSTILE_SECRET_KEY is not set. Refusing the request.");
      return false;
    }
    return true;
  }
  if (!options.token) return false;

  const body = new URLSearchParams({ secret, response: options.token });
  if (options.ip) body.set("remoteip", options.ip);

  try {
    const response = await (options.fetchImpl ?? fetch)(VERIFY_URL, { method: "POST", body });
    if (!response.ok) return false;
    const data = (await response.json()) as { success?: boolean };
    return data.success === true;
  } catch (error) {
    console.error("Turnstile check failed:", error);
    return false;
  }
}
