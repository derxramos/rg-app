import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { AdminTitle } from "@/components/admin/bits";
import { WarningBox } from "@/components/shared/warning-box";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, CheckboxRow } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { qrImageUrl } from "@/lib/qr-url";
import { settingsTrail } from "@/lib/crumbs";
import { guardPanelPage } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { getPaymentMethod } from "@/server/services/admin-settings";
import { PARSERS } from "@/ocr/parsers";

import { deletePaymentMethodAction, savePaymentMethodAction } from "../actions";

export const metadata: Metadata = { title: "Edit payment method" };

export default async function EditPaymentMethodPage({
  params,
}: PageProps<"/admin/settings/payments/[id]">) {
  const admin = await guardPanelPage("payment_methods.manage", "/admin/settings/payments/[id]");
  const { id } = await params;
  const isNew = id === "new";
  const method = isNew
    ? null
    : /^[0-9a-f-]{36}$/i.test(id)
      ? await getPaymentMethod(getDb(), id)
      : null;
  if (!isNew && !method) notFound();
  void admin;
  const qr = qrImageUrl(method?.qrImagePath);

  return (
    <>
      <AdminTitle
        title={isNew ? "Add a payment method" : `Edit ${method!.name}`}
        crumbs={[
          ...settingsTrail(admin.role),
          { label: "Payment methods", href: "/admin/settings/payments" },
          { label: isNew ? "Add a payment method" : method!.name },
        ]}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <WarningBox variant="warning" title="Careful: clients pay to this account">
              A wrong QR or account number sends clients&apos; money to the wrong place. Changing
              the QR picture, the account name or the account number needs a fresh code from your
              authenticator app. The change is logged and the owner gets an alert.
            </WarningBox>
            <ActionForm action={savePaymentMethodAction} fresh hidden={{ id }} submitLabel="Save">
              <div className="flex flex-col gap-2">
                <Label htmlFor="pm-name">Name (clients see this)</Label>
                <Input
                  id="pm-name"
                  name="name"
                  defaultValue={method?.name}
                  maxLength={60}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pm-parser">Receipt reader</Label>
                <NativeSelect
                  id="pm-parser"
                  name="parserKey"
                  defaultValue={method?.parserKey ?? ""}
                >
                  <option value="">None (clients type the values)</option>
                  {PARSERS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.displayName}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pm-account">Account name</Label>
                <Input
                  id="pm-account"
                  name="accountName"
                  defaultValue={method?.accountName}
                  maxLength={120}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pm-number">Account number</Label>
                <Input
                  id="pm-number"
                  name="accountNumber"
                  defaultValue={method?.accountNumber}
                  maxLength={60}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pm-instructions">Instructions (optional)</Label>
                <Textarea
                  id="pm-instructions"
                  name="instructions"
                  defaultValue={method?.instructions ?? ""}
                  maxLength={1000}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pm-qr">QR picture (JPG or PNG, 2 MB at most)</Label>
                <Input id="pm-qr" name="qr" type="file" accept="image/jpeg,image/png" />
              </div>
              <CheckboxRow htmlFor="pm-active">
                <Checkbox
                  id="pm-active"
                  name="isActive"
                  defaultChecked={method?.isActive ?? false}
                />
                <span>Show this method to clients</span>
              </CheckboxRow>
            </ActionForm>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>How the client sees it</CardTitle>
            </CardHeader>
            <CardContent>
              {qr ? (
                <Image
                  src={qr}
                  alt="Current QR picture"
                  width={220}
                  height={280}
                  unoptimized
                  className="h-auto w-full max-w-[220px] rounded-md border bg-white"
                />
              ) : (
                <p className="text-muted-foreground">No QR picture yet.</p>
              )}
              <p className="text-sm text-muted-foreground">Account name</p>
              <p className="text-2xl font-bold break-words">{method?.accountName ?? "..."}</p>
              <p className="font-mono text-lg break-all">{method?.accountNumber ?? "..."}</p>
            </CardContent>
          </Card>
          {method ? (
            <Card>
              <CardHeader>
                <CardTitle>Delete</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  A method that payments used cannot be deleted. Turn it off instead.
                </p>
                <ActionForm
                  action={deletePaymentMethodAction}
                  fresh
                  hidden={{ id: method.id }}
                  submitLabel="Delete this method"
                  variant="destructive"
                >
                  <span />
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
