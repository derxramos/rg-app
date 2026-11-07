import { isTwoFactorRequired } from "@/lib/two-factor-flag";

// Runs once when the server starts. If 2FA is off, say so in the server log (also in production).
export function register() {
  if (!isTwoFactorRequired(process.env.ADMIN_REQUIRE_2FA)) {
    console.warn(
      "[WARNING] ADMIN_REQUIRE_2FA=false: 2-step login is OFF for admins. " +
        "Turn it on before real clients use this site.",
    );
  }
}
