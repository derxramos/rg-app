// Security headers (docs/SECURITY_AND_PRIVACY.md T4, T5, T8). They are set in next.config.ts, so they work on any host.

type Options = {
  // In development, Next.js needs a few more allowances (hot reload).
  development: boolean;
  // The Supabase address (for the QR pictures in the public bucket). Optional.
  supabaseUrl?: string;
};

function origin(value: string | undefined): string | null {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
}

// What each directive allows, and why:
//  - script-src 'unsafe-inline': Next.js puts small inline scripts in every page. A per-request "nonce" would
//    make every page dynamic (no static pages, more Netlify credits). We accept this, because React escapes
//    all text, there is no raw HTML anywhere (owner Markdown skips HTML), and the other directives stay strict.
//  - 'wasm-unsafe-eval' and blob: workers and cdn.jsdelivr.net: the receipt reader (Tesseract.js) runs in a web
//    worker and loads its files from the jsDelivr CDN (docs/OCR_PAYMENTS.md section 2).
//  - challenges.cloudflare.com: the Turnstile spam check (script, frame and requests).
//  - img-src data: blob: the 2FA QR picture, the receipt preview, and small inline pictures.
export function buildCsp({ development, supabaseUrl }: Options): string {
  const supabase = origin(supabaseUrl);
  const turnstile = "https://challenges.cloudflare.com";
  const jsdelivr = "https://cdn.jsdelivr.net";

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "blob:", jsdelivr, turnstile, ...(development ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...(supabase ? [supabase] : [])],
    "font-src": ["'self'"],
    "connect-src": ["'self'", "blob:", jsdelivr, turnstile, ...(development ? ["ws:", "wss:"] : [])],
    "worker-src": ["'self'", "blob:"],
    "frame-src": [turnstile],
    // Nobody may put this site in a frame (clickjacking).
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };
  if (!development) directives["upgrade-insecure-requests"] = [];

  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(" ")}` : name))
    .join("; ");
}

export function securityHeaders(options: Options): { key: string; value: string }[] {
  const headers = [
    { key: "Content-Security-Policy", value: buildCsp(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Old browsers do not know frame-ancestors, so we also send X-Frame-Options.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // No camera, microphone, location or payment APIs are used. File pickers do not need a permission.
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  // Only on the real site (HTTPS). One year. Not "preload": that is a long promise the owner can make later.
  if (!options.development) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
  }
  return headers;
}
