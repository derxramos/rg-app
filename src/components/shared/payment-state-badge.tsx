import { CircleCheck, CircleDashed, CircleX, Clock, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";

// "not_paid" means there is no payment row yet. The other three match the payment_status enum.
export type PaymentState = "not_paid" | "pending" | "verified" | "rejected";

const PAYMENT_STATES: Record<
  PaymentState,
  { label: string; icon: LucideIcon; variant: "neutral" | "warning" | "success" | "danger" }
> = {
  not_paid: { label: "Not paid yet", icon: CircleDashed, variant: "neutral" },
  pending: { label: "Pending check", icon: Clock, variant: "warning" },
  verified: { label: "Verified", icon: CircleCheck, variant: "success" },
  rejected: { label: "Rejected", icon: CircleX, variant: "danger" },
};

export const PAYMENT_STATE_KEYS = Object.keys(PAYMENT_STATES) as PaymentState[];

export function PaymentStateBadge({ state }: { state: PaymentState }) {
  const { label, icon: Icon, variant } = PAYMENT_STATES[state];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
