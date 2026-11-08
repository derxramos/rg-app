import { ArrowDown, ArrowUp, Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { AdminTitle } from "@/components/admin/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatManilaDateTime } from "@/lib/time";
import { guardPanelPage } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { listAllPaymentMethods } from "@/server/services/admin-settings";

import { paymentMethodListAction } from "./actions";

export const metadata: Metadata = { title: "Payment methods" };

export default async function PaymentMethodsPage() {
  await guardPanelPage("payment_methods.manage", "/admin/settings/payments");
  const methods = await listAllPaymentMethods(getDb());

  return (
    <>
      <AdminTitle
        title="Payment methods"
        intro="Clients see the active methods, in this order. Changing a QR or an account needs a fresh 2FA code, and is written to the activity log."
        actions={
          <Link href="/admin/settings/payments/new" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Add a method
          </Link>
        }
      />
      {methods.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No payment methods yet"
          description="Add one so clients can pay by QR code."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {methods.map((m, index) => (
            <li key={m.id}>
              <Card className="gap-3 p-4 md:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link
                      href={`/admin/settings/payments/${m.id}`}
                      className="inline-flex min-h-11 items-center text-lg font-bold text-primary underline underline-offset-4"
                    >
                      {m.name}
                    </Link>
                    <span className="text-sm text-muted-foreground break-words">
                      {m.accountName} · changed {formatManilaDateTime(m.updatedAt)}
                    </span>
                  </div>
                  <Badge variant={m.isActive ? "success" : "neutral"}>
                    {m.isActive ? "On (clients see it)" : "Off"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionForm
                    action={paymentMethodListAction}
                    hidden={{ id: m.id, intent: m.isActive ? "off" : "on" }}
                    submitLabel={m.isActive ? "Turn off" : "Turn on"}
                    variant="outline"
                    size="sm"
                  >
                    <span />
                  </ActionForm>
                  {index > 0 ? (
                    <ActionForm
                      action={paymentMethodListAction}
                      hidden={{ id: m.id, intent: "up" }}
                      submitLabel="Move up"
                      variant="ghost"
                      size="sm"
                    >
                      <span />
                    </ActionForm>
                  ) : null}
                  {index < methods.length - 1 ? (
                    <ActionForm
                      action={paymentMethodListAction}
                      hidden={{ id: m.id, intent: "down" }}
                      submitLabel="Move down"
                      variant="ghost"
                      size="sm"
                    >
                      <span />
                    </ActionForm>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <span className="hidden">
        <ArrowUp />
        <ArrowDown />
      </span>
    </>
  );
}
