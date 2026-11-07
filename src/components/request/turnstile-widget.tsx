"use client";

import Script from "next/script";

// The Cloudflare Turnstile box (spam check). Its colors follow the device setting ("auto"). It adds a hidden field "cf-turnstile-response" to the
// form. The SERVER checks that token with Cloudflare (it is never trusted by the browser alone).
// With no site key (local development) nothing is shown, and the server skips the check.
export function TurnstileWidget() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;

  return (
    <div className="flex flex-col gap-2">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <div className="cf-turnstile min-h-[65px]" data-sitekey={siteKey} data-theme="auto" />
    </div>
  );
}
