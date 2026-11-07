import { WarningBox } from "@/components/shared/warning-box";

// The exact text the owner asked for. Kept in one place so a test can check it.
export const TWO_FACTOR_OFF_TEXT =
  "2-step login is OFF. Turn it on before real clients use this site.";

// Red banner at the top of every admin page while ADMIN_REQUIRE_2FA is "false".
// It shows in production builds too, on purpose.
export function TwoFactorOffBanner() {
  return (
    <WarningBox variant="danger" strong className="rounded-none border-x-0 border-t-0">
      <p className="font-bold">{TWO_FACTOR_OFF_TEXT}</p>
    </WarningBox>
  );
}
