import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Token helpers. These take the secret as an argument so they are easy to test.

// A long random token for a cookie. 32 random bytes is 256 bits: it cannot be guessed.
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

// The database stores only this hash of a token, never the token itself.
export function hmacHex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

// Compares two strings in constant time, so the time taken does not leak how many characters matched.
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// A signed value: "payload.signature". Used for short cookies that only the server may create.
export function signValue(secret: string, payload: string): string {
  return `${payload}.${hmacHex(secret, payload)}`;
}

// Returns the payload when the signature is correct, otherwise null.
export function verifySigned(secret: string, signed: string): string | null {
  const index = signed.lastIndexOf(".");
  if (index < 1) return null;
  const payload = signed.slice(0, index);
  const signature = signed.slice(index + 1);
  return safeEqual(signature, hmacHex(secret, payload)) ? payload : null;
}
