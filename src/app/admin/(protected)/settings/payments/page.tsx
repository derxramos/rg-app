import { Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AdminTitle } from "@/components/admin/bits";
import { PaymentMethodsList } from "@/components/admin/payment-methods-list";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { formatManilaDateTime } from "@/lib/time";
import { guardPanelPage } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { listAllPaymentMethods } from "@/server/services/admin-settings";

export const metadata: Metadata = { title: "Payment methods" };

export default async function PaymentMethodsPage() {
  await guardPanelPage("payment_methods.manage", "/admin/settings/payments");
  const methods = await listAllPaymentMethods(getDb());

  return (
    <>
      <AdminTitle
        title="Payment methods"
        intro="Clients see the active methods, in this order. Changing a QR or an account, or deleting a method, needs a fresh 2FA code and is written to the activity log."
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
        <PaymentMethodsList
          rows={methods.map((m) => ({
            id: m.id,
            name: m.name,
            detail: `${m.accountName} · changed ${formatManilaDateTime(m.updatedAt)}`,
            isActive: m.isActive,
            paymentCount: m.paymentCount,
          }))}
        />
      )}
    </>
  );
}
