import { describe, expect, it } from "vitest";

import { buildCsp, securityHeaders } from "@/lib/security-headers";

const prod = { development: false, supabaseUrl: "https://abcd.supabase.co/" };
const header = (name: string, options: { development: boolean; supabaseUrl?: string } = prod) => securityHeaders(options).find((h) => h.key === name)?.value;

describe("security headers", () => {
  it("send all the headers the plan asks for", () => {
    for (const name of ["Content-Security-Policy", "Strict-Transport-Security", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
      expect(header(name), name).toBeTruthy();
    }
  });
  it("forbid framing, plugins and other base addresses", () => {
    const csp = buildCsp(prod);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(header("X-Frame-Options")).toBe("DENY");
  });
  it("allow only the outside hosts we use: jsDelivr (receipt reader), Cloudflare (Turnstile), our Supabase", () => {
    const csp = buildCsp(prod);
    const hosts = new Set([...csp.matchAll(/https:\/\/[^\s;]+/g)].map((m) => m[0]));
    expect([...hosts].sort()).toEqual(["https://abcd.supabase.co", "https://cdn.jsdelivr.net", "https://challenges.cloudflare.com"]);
  });
  it("never allows eval in production, and has HSTS only in production", () => {
    expect(buildCsp(prod)).not.toContain("'unsafe-eval'");
    expect(buildCsp(prod)).toContain("upgrade-insecure-requests");
    expect(buildCsp({ development: true })).toContain("'unsafe-eval'");
    expect(header("Strict-Transport-Security")).toMatch(/max-age=31536000/);
    expect(header("Strict-Transport-Security", { development: true })).toBeUndefined();
  });
  it("does not allow any wildcard for scripts", () => {
    const scripts = buildCsp(prod).split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scripts).not.toMatch(/\*|https:\s|http:/);
  });
  it("turns off the browser features we never use", () => {
    expect(header("Permissions-Policy")).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/);
  });
});
