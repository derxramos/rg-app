import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { WarningBox } from "@/components/shared/warning-box";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Admin login" };

export default function AdminLoginPage() {
  const bypass =
    process.env.NODE_ENV === "development" && Boolean(process.env.DEV_ADMIN_BYPASS_EMAIL);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-primary-ink">Admin login</h1>
      {bypass ? (
        <WarningBox variant="warning" title="Development bypass is ON">
          You are on a development computer.{" "}
          <Link href="/admin" className="font-bold underline">
            Go to the admin area
          </Link>{" "}
          without a login.
        </WarningBox>
      ) : null}
      <ActionForm action={loginAction} submitLabel="Log in" size="lg">
        <div className="flex flex-col gap-2">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
      </ActionForm>
      <p className="text-sm text-muted-foreground">
        Only the owner and staff can log in here. After the password you will be asked for a 6-digit
        code.
      </p>
    </div>
  );
}
