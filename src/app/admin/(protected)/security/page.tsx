import type { Metadata } from "next";

import { AdminTitle } from "@/components/admin/bits";
import { ActionForm } from "@/components/admin/action-form";
import { DeviceList } from "@/components/admin/device-list";
import { MfaSetup } from "@/components/admin/mfa-setup";
import { WarningBox } from "@/components/shared/warning-box";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatManilaDate } from "@/lib/time";
import { createMfaApi } from "@/server/auth/mfa-api";
import { verifiedOf } from "@/server/auth/mfa-devices";
import { getPanelSession, guardPanelPage } from "@/server/auth/panel";
import { supabaseAuthConfigured } from "@/server/auth/supabase-server";

import { unlockDevicesAction } from "./actions";

export const metadata: Metadata = { title: "Security" };

// "Security": the authenticator devices of the signed-in person (every staff, admin and owner account).
// List them, add a backup device, remove one (only with a code from another device, never the last one).
export default async function SecurityPage() {
  await guardPanelPage("security.self", "/admin/security");

  if (!supabaseAuthConfigured()) {
    return (
      <>
        <AdminTitle title="Security" />
        <WarningBox variant="info" title="Not available here">
          Sign in with Supabase to manage your authenticator devices. This copy of the site runs
          without it.
        </WarningBox>
      </>
    );
  }

  const [session, factors] = await Promise.all([
    getPanelSession(),
    createMfaApi().then((api) => api.list()),
  ]);
  const devices = factors.map((f) => ({
    id: f.id,
    name: f.name,
    added: formatManilaDate(new Date(f.createdAt)),
    verified: f.verified,
  }));
  const verifiedCount = verifiedOf(factors).length;
  // Adding or removing a device needs the higher level (a code typed at sign in).
  const locked = verifiedCount > 0 && session?.aal !== "aal2";

  return (
    <>
      <AdminTitle
        title="Security"
        intro="Your authenticator devices. Forgot password does not bring back a lost authenticator, so keep a backup device. You can also scan the same QR code on two phones."
      />

      {verifiedCount === 0 ? (
        <WarningBox variant="warning" title="You have no authenticator device yet">
          Add one below. Without it your account cannot use 2-step login.
        </WarningBox>
      ) : verifiedCount === 1 ? (
        <WarningBox variant="warning" title="You have only one device">
          If you lose it, another person must reset your 2-step login. Add a backup device below.
        </WarningBox>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
        <section aria-labelledby="devices" className="flex flex-col gap-3">
          <h2 id="devices" className="text-xl font-bold">
            Your devices
          </h2>
          {devices.length === 0 ? (
            <p className="text-base text-muted-foreground">No devices yet.</p>
          ) : (
            <DeviceList devices={devices} />
          )}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Add a device</CardTitle>
          </CardHeader>
          <CardContent>
            {locked ? (
              <ActionForm action={unlockDevicesAction} submitLabel="Unlock">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="unlock-code">
                    Enter the 6-digit code from YOUR authenticator app to add or remove devices.
                  </Label>
                  <Input
                    id="unlock-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={7}
                    className="max-w-48"
                    required
                  />
                </div>
              </ActionForm>
            ) : (
              <MfaSetup verifiedCount={verifiedCount} mode="optional" />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
