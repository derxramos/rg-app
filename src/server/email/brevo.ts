import "server-only";

// Sends one email with the Brevo transactional REST API (v3). Plain fetch, no SDK, so it works on any host.
// Docs: docs/ARCHITECTURE.md section 8.

export type EmailMessage = {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  replyTo?: { email: string; name?: string };
};

export type BrevoConfig = {
  apiKey: string | undefined;
  fromAddress: string | undefined;
  fromName: string | undefined;
};

export type SendResult = { ok: true; messageId: string | null } | { ok: false; error: string };

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

// Never throws. A failed email must not break the action that caused it.
export async function sendWithBrevo(
  message: EmailMessage,
  config: BrevoConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  if (!config.apiKey) return { ok: false, error: "Email is not set up (BREVO_API_KEY is missing)." };
  if (!config.fromAddress) return { ok: false, error: "Email is not set up (EMAIL_FROM_ADDRESS is missing)." };

  try {
    const response = await fetchImpl(BREVO_URL, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "api-key": config.apiKey },
      body: JSON.stringify({
        sender: { email: config.fromAddress, name: config.fromName || undefined },
        to: [message.to],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Only a short note is saved. The API key and the message are never put in the error.
      return { ok: false, error: `Brevo answered ${response.status}.` };
    }
    const data = (await response.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, messageId: data.messageId ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `Could not reach Brevo (${error.name}).` : "Could not reach Brevo." };
  }
}
